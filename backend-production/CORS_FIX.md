# CORS Fix Guide

## ✅ Changes Made

1. **Enhanced CORS Configuration** (`src/server.ts`)
   - Added explicit methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
   - Added allowed headers: Content-Type, Authorization, etc.
   - Added explicit OPTIONS handler for preflight requests
   - Added CORS error logging for debugging

2. **Frontend URL Normalization** (`projectAdmin-production/src/lib/api-client.ts`)
   - Fixed double-slash issues in API URLs
   - Added URL normalization helper

## 🔧 Required Setup

### Step 1: Set Environment Variable in Railway

1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to **Variables** tab
4. Add new variable:
   - **Name**: `FRONTEND_URL_ADMIN`
   - **Value**: `https://your-vercel-admin-app.vercel.app`
   - Replace with your actual Vercel domain (e.g., `https://trainmice-admin.vercel.app`)

### Step 2: Set Environment Variable in Vercel

1. Go to your Vercel project dashboard
2. Click on your admin project
3. Go to **Settings** → **Environment Variables**
4. Add new variable:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://your-railway-backend.railway.app/api`
   - Replace with your actual Railway backend URL

### Step 3: Redeploy Both Services

**Railway:**
- After adding `FRONTEND_URL_ADMIN`, Railway will auto-redeploy
- Or manually trigger a redeploy

**Vercel:**
- After adding `VITE_API_URL`, Vercel will auto-redeploy
- Or manually trigger a redeploy

## 🔍 Verify CORS is Working

1. **Check Railway Logs:**
   - Look for: `🔒 CORS Configuration:`
   - Should show your Vercel URL in "Allowed origins"

2. **Check Browser Console:**
   - Open DevTools → Network tab
   - Make a request from your frontend
   - Check if OPTIONS preflight returns 200
   - Check if actual request succeeds

3. **Test CORS:**
   ```bash
   curl -X OPTIONS https://your-railway-backend.railway.app/api/auth/login \
     -H "Origin: https://your-vercel-app.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -v
   ```

## 🐛 Troubleshooting

### Still Getting CORS Errors?

1. **Verify Environment Variable:**
   - Check Railway logs on startup
   - Should see: `Allowed origins: https://your-vercel-app.vercel.app`

2. **Check Exact URL Match:**
   - CORS is case-sensitive
   - Must match exactly (including `https://` and trailing slash)
   - Vercel URLs are usually: `https://project-name.vercel.app`

3. **Check Browser Console:**
   - Look for the exact error message
   - Check Network tab → Headers → Response Headers
   - Should see `Access-Control-Allow-Origin` header

4. **Common Issues:**
   - ❌ Wrong domain (missing `https://`)
   - ❌ Trailing slash mismatch
   - ❌ Environment variable not set
   - ❌ Backend not redeployed after changes

## 📝 Quick Checklist

- [ ] `FRONTEND_URL_ADMIN` set in Railway
- [ ] `VITE_API_URL` set in Vercel
- [ ] Both services redeployed
- [ ] Railway logs show correct CORS origins
- [ ] Browser console shows no CORS errors
- [ ] Network tab shows OPTIONS returning 200

