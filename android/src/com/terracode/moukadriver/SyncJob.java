package com.terracode.moukadriver;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class SyncJob extends JobService {
    private static final int JOB = 71042;
    private Thread worker;

    static boolean configured() { return SyncConfig.ENDPOINT.startsWith("https://"); }

    static void schedule(Context context) {
        if (!configured()) return;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        synchronized (SyncJob.class) {
            if (scheduler.getPendingJob(JOB) != null) return;
            scheduler.schedule(new JobInfo.Builder(JOB, new ComponentName(context, SyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
        }
    }

    @Override public boolean onStartJob(JobParameters parameters) {
        worker = new Thread(() -> {
            boolean retry = true;
            try {
                Store store = Store.get(this);
                for (int i = 0; i < 10 && !Thread.currentThread().isInterrupted(); i++) {
                    JSONArray batch = store.batch();
                    if (batch.length() == 0) {
                        retry = false;
                        break;
                    }
                    if (!upload(batch)) break;
                    store.acknowledge(batch);
                }
            } catch (Exception e) {
                Log.w("MoukaDriver", "Dispatch sync will retry");
            }
            boolean reschedule = retry;
            Thread completedWorker = Thread.currentThread();
            new android.os.Handler(getMainLooper()).post(() -> {
                if (worker != completedWorker) return;
                worker = null;
                synchronized (SyncJob.class) {
                    jobFinished(parameters, reschedule);
                    try {
                        if (!reschedule && Store.get(this).batch().length() > 0) schedule(this);
                    } catch (org.json.JSONException e) {
                        Log.w("MoukaDriver", "Could not read the sync queue");
                    }
                }
            });
        }, "mouka-sync");
        worker.start();
        return true;
    }

    private boolean upload(JSONArray batch) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(SyncConfig.ENDPOINT).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            byte[] request = new JSONObject().put("events", batch).toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(request.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(request); }
            int code = connection.getResponseCode();
            return code >= 200 && code <= 299;
        } finally {
            connection.disconnect();
        }
    }

    @Override public boolean onStopJob(JobParameters parameters) {
        if (worker != null) worker.interrupt();
        worker = null;
        return true;
    }
}
