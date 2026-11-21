package com.terracode.moukadriver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

public final class TrackingService extends Service implements LocationListener {
    static volatile boolean tracking;
    private LocationManager locations;
    private String trip;
    private long startedAt;
    private long lastFix;

    static boolean hasLocation(Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String active = Store.get(this).activeTrip();
        if (tracking && active != null && active.equals(trip)) return START_NOT_STICKY;
        try {
            NotificationManager notifications = getSystemService(NotificationManager.class);
            notifications.createNotificationChannel(new NotificationChannel("trip_tracking", "Trip tracking",
                NotificationManager.IMPORTANCE_LOW));
            PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            startForeground(1042, new Notification.Builder(this, "trip_tracking")
                .setSmallIcon(getResources().getIdentifier("tracking_status", "drawable", getPackageName()))
                .setContentTitle("Mouka Driver is recording location")
                .setContentText(active == null ? "Open Mouka Driver" : active + " · End the trip to stop tracking")
                .setContentIntent(open).setOngoing(true).build());
            if (active == null || !hasLocation(this)) {
                stopSelf();
                return START_NOT_STICKY;
            }
            locations = getSystemService(LocationManager.class);
            locations.removeUpdates(this);
            trip = active;
            startedAt = SystemClock.elapsedRealtimeNanos();
            lastFix = 0;
            boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean gps = fine && register(LocationManager.GPS_PROVIDER);
            boolean network = register(LocationManager.NETWORK_PROVIDER);
            tracking = gps || network;
            if (!tracking) stopSelf();
        } catch (SecurityException | IllegalStateException failure) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private boolean register(String provider) {
        if (!locations.isProviderEnabled(provider)) return false;
        locations.requestLocationUpdates(provider, 15000, 0, this, Looper.getMainLooper());
        return true;
    }

    @Override public void onLocationChanged(Location fix) {
        long timestamp = fix.getElapsedRealtimeNanos();
        if (!tracking || timestamp < startedAt || timestamp - lastFix < 12_000_000_000L) return;
        lastFix = timestamp;
        Store.get(this).location(trip, fix);
        SyncJob.schedule(this);
    }

    @Override public void onProviderDisabled(String provider) {
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if ((!fine || !locations.isProviderEnabled(LocationManager.GPS_PROVIDER))
            && !locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            tracking = false;
            stopSelf();
        }
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override public void onDestroy() {
        tracking = false;
        if (locations != null) locations.removeUpdates(this);
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
