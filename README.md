
# CashEase - Cashback & Coupons (Rebuild)

This is a Next.js application built with Firebase, ShadCN UI, and TypeScript. It aims to replicate core functionalities of a cashback and coupon platform like CashKaro.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

2.  **Set up Firebase:**
    *   Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
    *   Enable Authentication (Email/Password, Google).
    *   Enable Firestore Database.
    *   Copy your Firebase project configuration details.
    *   Create a `.env.local` file in the project root (copy from `.env.local.example` if provided).
    *   Fill in your Firebase configuration details in `.env.local`. **Make sure all `NEXT_PUBLIC_FIREBASE_*` variables are correctly set.**
    *   **Add Authorized Domain for Development:** In Firebase Console -> Authentication -> Settings -> Authorized domains, add `localhost` and any other development domains (like your Studio preview URL).
    *   **Set Security Rules:** Update `firestore.rules` with appropriate rules for your collections. Start with permissive rules for testing if needed (e.g., `allow read, write: if request.auth != null;`) but tighten them for production. Deploy rules using `firebase deploy --only firestore:rules`.
    *   **Deploy Firestore Indexes:** Ensure your `firestore.indexes.json` file contains all necessary composite indexes for your queries. Deploy them using `firebase deploy --only firestore:indexes`. If the CLI prompts about deleting indexes not in your local file, review carefully before proceeding or update your local file first.

3.  **Run the Development Server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

4.  Open [http://localhost:9002](http://localhost:9002) (or your configured port) in your browser.

5.  **(Optional) Seed Data:** If you need initial data, run the seeding script:
    ```bash
    npm run seed
    ```
    _Note: Ensure the database is empty or the seeding script handles existing data appropriately before running._

## Key Technologies

*   **Next.js (App Router):** React framework for server-side rendering and static site generation.
*   **Firebase:** Backend services (Authentication, Firestore).
*   **ShadCN UI:** Accessible and customizable UI components built with Radix UI and Tailwind CSS.
*   **Tailwind CSS:** Utility-first CSS framework.
*   **TypeScript:** Typed JavaScript for improved code quality.
*   **Zod:** Schema validation.
*   **React Hook Form:** Form management.
*   **Lucide Icons:** Icon library.
*   **Embla Carousel:** Carousel component.

## Project Structure (Overview)

*   `src/app`: Next.js App Router pages and layouts.
*   `src/components`: Reusable UI components.
    *   `src/components/ui`: ShadCN UI components.
    *   `src/components/layout`: Header, Footer, Sidebar components.
    *   `src/components/admin`: Components specific to the admin panel.
*   `src/hooks`: Custom React hooks (e.g., `useAuth`).
*   `src/lib`: Utility functions, Firebase configuration, type definitions, actions, seeding script.
*   `public`: Static assets (images, fonts).
*   `styles`: Global CSS (managed by `globals.css`).
*   `firebase.json`: Firebase project configuration (hosting, functions, etc.).
*   `firestore.rules`: Firestore security rules.
*   `firestore.indexes.json`: Firestore index definitions.

## Core Functionalities Implemented

*   **User Authentication:** Sign up, Login (Email/Password, Google).
*   **Store Management (Admin):** Add, edit, delete stores.
*   **Coupon Management (Admin):** Add, edit, delete coupons.
*   **Category Management (Admin):** Add, edit, delete categories.
*   **Banner Management (Admin):** Add, edit, delete homepage banners.
*   **User Management (Admin):** View users, disable/enable accounts.
*   **Transaction Management (Admin):** View transactions, update status.
*   **Payout Management (Admin):** View payout requests, update status.
*   **Homepage:** Displays banners, featured stores, top coupons.
*   **Store Listing Page:** Lists all active stores with search.
*   **Coupon Listing Page:** Lists all active coupons with search.
*   **Category Listing Page:** Lists all categories.
*   **Store Detail Page:** Shows store information and associated coupons.
*   **Category Detail Page:** Shows stores belonging to a specific category.
*   **Search Page:** Displays search results for stores and coupons.
*   **Dashboard:** User overview, cashback summary, quick links.
*   **Cashback History:** User's transaction history.
*   **Click History:** User's click tracking history.
*   **Payout Request:** Form for users to request payout.
*   **Referrals Page:** Displays referral link and stats.
*   **Account Settings:** Update profile, email, password, payout details.
*   **Static Pages:** About Us, How It Works, Contact, FAQ.
*   **Click Tracking:** Logs user clicks on affiliate links.
*   **Admin Guard:** Protects admin routes.
*   **Protected Routes:** Protects dashboard routes.

## Important Notes

*   **Security Rules:** The provided `firestore.rules` might be basic. Ensure you implement robust security rules for production environments.
*   **Firebase Indexing:** Firestore requires specific indexes for complex queries. If you encounter query errors, check the Firebase console for index creation suggestions or update `firestore.indexes.json` and deploy.
*   **Environment Variables:** Keep your Firebase API keys and configuration in `.env.local` and never commit this file to version control.
*   **Admin Setup:** Initial admin user setup relies on the `NEXT_PUBLIC_INITIAL_ADMIN_UID` environment variable. For production, implement a more secure role management system (e.g., using Cloud Functions).
