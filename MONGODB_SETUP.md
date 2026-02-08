# MongoDB Atlas Setup Guide for Render

Since you are hosting on Render, you cannot use a local database. You must use a cloud database like **MongoDB Atlas**. Follow these steps to get your `MONGO_URI`.

## Step 1: Create Account
1. Go to [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas/register).
2. Sign up for a free account.

## Step 2: Create a Cluster
1. After login, click **+ Create**.
2. Select the **M0 Free** tier (Shared).
3. Choose a provider (AWS) and region (closest to you, e.g., Mumbai).
4. Click **Create Deployment**.

## Step 3: Create Database User
1. Go to **Security > Database Access** (side menu).
2. Click **+ Add New Database User**.
3. Username: `admin` (or anything you like).
4. Password: `password123` (make it strong!).
5. Click **Add User**.

## Step 4: Allow Network Access (Important!)
1. Go to **Security > Network Access**.
2. Click **+ Add IP Address**.
3. Click **Allow Access From Anywhere** (`0.0.0.0/0`).
4. Click **Confirm**.

## Step 5: Get Connection String
1. Go to **Deployment > Database** (side menu).
2. Click **Connect** button on your cluster.
3. Select **Drivers**.
4. Copy the connection string. It looks like:
   ```
   mongodb+srv://admin:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```

## Step 6: Add to Render
1. Go to **Render Dashboard > Environment**.
2. Add a new variable:
   - **Key:** `MONGO_URI`
   - **Value:** Paste the string you copied.
   - **IMPORTANT:** Replace `<password>` with the actual password you created in Step 3.
3. Click **Save Changes**.

Once you do this, your Admin Account and Students will be saved permanently!
