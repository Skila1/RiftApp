Next Steps (manual, requires your action)
Firebase — Create project at console.firebase.google.com, add iOS + Android apps, set FIREBASE_CREDENTIALS_JSON env var
  ⚠ Never commit the service-account JSON to source control. Set FIREBASE_CREDENTIALS_JSON only via CI secrets or a secrets manager (GitHub Secrets, GCP Secret Manager, AWS Secrets Manager). Rotate the service account periodically and restrict its IAM permissions to Firebase Messaging only.
APNs — Upload your APNs key to Firebase for iOS push delivery
App Icon — Place a 1024x1024 icon.png in frontend/assets/ and run npm run icons:generate
Android — Open with npm run cap:open:android in Android Studio, build and test
iOS — On a Mac, open with npm run cap:open:ios in Xcode, configure signing, build and test
App Links verification — Host /.well-known/assetlinks.json (Android) and /.well-known/apple-app-site-association (iOS) on riftapp.io