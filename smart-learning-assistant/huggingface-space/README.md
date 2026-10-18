# Smart Learning AI proxy

Upload `main.py` and `requirements.txt` to the Hugging Face Space. Configure
these Space variables/secrets in **Settings**:

- Secret `HF_TOKEN`: Hugging Face access token with inference permission.
- Variable `FIREBASE_PROJECT_ID`: `smart-tertiary-tech-learning`.
- Variable `ALLOWED_ORIGIN`: `https://smart-tertiary-tech-learning.web.app`.
- Variable `HF_MODEL`: a model available to your Hugging Face account.

The React application sends a Firebase ID token in the `Authorization: Bearer`
header. The proxy verifies that token before calling Hugging Face, so the
provider token is never sent to the browser.

