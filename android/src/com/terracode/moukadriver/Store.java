package com.terracode.moukadriver;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class Store extends SQLiteOpenHelper {
    private static Store shared;

    static synchronized Store get(Context context) {
        if (shared == null) shared = new Store(context.getApplicationContext());
        return shared;
    }

    private Store(Context context) {
        super(context, "mouka-driver.db", null, 1);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE trips (id TEXT PRIMARY KEY, phase TEXT NOT NULL, done INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, payload TEXT NOT NULL)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int previous, int next) {
        throw new IllegalStateException("Missing database migration");
    }

    JSONObject snapshot(boolean tracking, String note) throws JSONException {
        SQLiteDatabase db = getReadableDatabase();
        JSONObject trips = new JSONObject();
        try (Cursor c = db.rawQuery("SELECT id, phase, done FROM trips", null)) {
            while (c.moveToNext()) {
                trips.put(c.getString(0), new JSONObject().put("phase", c.getString(1)).put("done", c.getInt(2)));
            }
        }
        int pending;
        try (Cursor c = db.rawQuery("SELECT COUNT(*) FROM outbox", null)) {
            c.moveToFirst();
            pending = c.getInt(0);
        }
        return new JSONObject().put("trips", trips).put("tracking", tracking).put("pending", pending).put("note", note);
    }

    synchronized boolean transition(String trip, String action, int stopCount, int expectedStop) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            String phase = "assigned";
            int done = 0;
            try (Cursor c = db.rawQuery("SELECT phase, done FROM trips WHERE id=?", new String[]{trip})) {
                if (c.moveToFirst()) {
                    phase = c.getString(0);
                    done = c.getInt(1);
                }
            }
            JSONObject event = new JSONObject();
            switch (action) {
                case "start":
                    if (!phase.equals("assigned") || activeTrip() != null) return false;
                    phase = "active";
                    break;
                case "confirm":
                    if (!phase.equals("active") || done >= stopCount || done != expectedStop) return false;
                    event.put("stopIndex", done++);
                    break;
                case "end":
                    if (!phase.equals("active") || done != stopCount) return false;
                    phase = "completed";
                    break;
                default:
                    return false;
            }
            ContentValues values = new ContentValues();
            values.put("id", trip);
            values.put("phase", phase);
            values.put("done", done);
            db.replaceOrThrow("trips", null, values);
            enqueue(db, trip, action, event);
            db.setTransactionSuccessful();
            return true;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        } finally {
            db.endTransaction();
        }
    }

    String activeTrip() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM trips WHERE phase='active' LIMIT 1", null)) {
            return c.moveToFirst() ? c.getString(0) : null;
        }
    }

    synchronized void location(String trip, android.location.Location gps) {
        if (!trip.equals(activeTrip())) return;
        try {
            enqueue(getWritableDatabase(), trip, "location", new JSONObject()
                .put("latitude", gps.getLatitude()).put("longitude", gps.getLongitude())
                .put("accuracyMetres", gps.getAccuracy()).put("recordedAt", gps.getTime()));
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private void enqueue(SQLiteDatabase db, String trip, String type, JSONObject event) throws JSONException {
        String id = java.util.UUID.randomUUID().toString();
        event.put("id", id).put("tripId", trip).put("type", type).put("createdAt", System.currentTimeMillis());
        ContentValues values = new ContentValues();
        values.put("uuid", id);
        values.put("payload", event.toString());
        db.insertOrThrow("outbox", null, values);
    }

    JSONArray batch() throws JSONException {
        JSONArray batch = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT payload FROM outbox ORDER BY seq LIMIT 100", null)) {
            while (c.moveToNext()) batch.put(new JSONObject(c.getString(0)));
        }
        return batch;
    }

    void acknowledge(JSONArray batch) throws JSONException {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (int i = 0; i < batch.length(); i++) {
                db.delete("outbox", "uuid=?", new String[]{batch.getJSONObject(i).getString("id")});
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }
}
