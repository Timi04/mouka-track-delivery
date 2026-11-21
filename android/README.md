# Mouka Driver

Mouka Driver is the Android companion to the Mouka Dispatch dashboard. This preview bundles two sample assignments and keeps trip events and location fixes on the device.

## Try a trip

1. Open Sample Stop B delivery and tap **Start trip**. Grant location access while using the app. Precise access enables GPS fixes.
2. Lock the screen on an Android test phone and walk a short distance. Reopen the app and check the queued update count.
3. Confirm both delivery stops in order. Tap **End trip** and verify the tracking notification disappears.
4. Reopen the app to check the completed trip and queued updates persist.

Android can stop a service after a force-stop, reboot, permission revocation or other device interruption. An interrupted trip stays active and offers **Resume tracking** when reopened. The preview uses a local database and does not require network access for this flow.

## Build

Install a JDK, Python 3, and Android SDK Platform 35 and Build Tools 35.0.0. Put the Android SDK location in `ANDROID_HOME`. From the source directory run:

```sh
./build.sh
```

The build signs a preview APK at `out/Mouka-Driver-preview.apk` for Android 8.0 and later with an up-to-date Android System WebView. Keep the preview signing key between test builds if you need to install an update over the preceding build.

## Dispatch integration

The current Dispatch demo has no shared trips API. App assignments come from `assets/trips.json`.

The native uploader is disabled by default. For a controlled pilot, supply an HTTPS endpoint in `MOUKA_SYNC_ENDPOINT` at build time. The uploader posts `{"events":[...]}` in the original arrival order. Events include `id` (UUID), `tripId`, `type`, and `createdAt` (Unix milliseconds). Delivery confirmations include the zero-based `stopIndex`. Location fixes include `latitude`, `longitude`, `accuracyMetres`, and `recordedAt`.

The server must deduplicate by event ID and return a 2xx status only after durably accepting every event in the batch. Failed or interrupted batches remain queued. Android JobScheduler retries with network access subject to device scheduling limits. Before a production rollout, connect driver authentication and assignment delivery, authorize events against driver and trip on the server, and test tracking with the actual fleet phones.
