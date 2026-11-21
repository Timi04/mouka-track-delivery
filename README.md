# Mouka Track Delivery

TerraCode Analytics’ delivery tracking prototypes for Mouka.

| Directory | Contents |
| --- | --- |
| `web/` | The shared sign-in page, Dispatch workspace, and Driver web workspace. |
| `android/` | The native Android Driver pilot, including its foreground location service and offline queue. |
| `legacy-driver/` | The redirect for the original Driver preview address. |

## Web preview

Run this from the repository root and open http://localhost:8000:

```sh
python3 -m http.server 8000 --directory web
```

Choose Admin or Driver, fill the demo credentials, and review the acknowledgments. The repository ships with synthetic trip, fleet and account fixtures. The Driver route diagram works with these fixtures. To enable street maps and driving directions, provide authorized route coordinates and addresses in the trip data.

The hosted preview is [Mouka Track Delivery](https://mouka-dispatch.neonwhale8.chatgpt.site/#/sign-in). Web accounts, settings and trip updates use browser storage. Authentication, verification links, tracking updates and admin notices use demo flows. Use sample data.

## Android pilot

See [Android build instructions](android/README.md). Android supports native trip recording and a local outbox. Connect live assignments and sync to a shared backend before a production rollout.
