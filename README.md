
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
    *   Fill in your Firebase configuration details in `.env.local`.

3.  **Run the Development Server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

4.  Open [http://localhost:9002](http://localhost:9002) (or your configured port) in your browser.

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
*   `src/lib`: Utility functions, Firebase configuration, type definitions.
*   `public`: Static assets (images, fonts).
*   `styles`: Global CSS (managed by `globals.css`).
