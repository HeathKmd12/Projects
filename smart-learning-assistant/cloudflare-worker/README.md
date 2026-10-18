# Smart Learning secure API

This Worker keeps the Hugging Face token outside the React browser application.

## Before deployment

1. Create a Cloudflare account and authenticate Wrangler with `npx wrangler login`.
2. In this folder run `npm install`.
3. Store the Hugging Face token securely:

   ```powershell
   npx wrangler secret put HF_TOKEN
   ```

4. Deploy with `npm run deploy`.
5. Copy the resulting `https://...workers.dev` address into the React application's `VITE_SECURE_API_URL` environment variable.

Never put `HF_TOKEN` into the React `.env` file or Firebase public configuration.

