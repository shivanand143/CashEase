--- a/src/hooks/use-auth.tsx
+++ b/src/hooks/use-auth.tsx
@@ -157,6 +157,7 @@
         }
     }, []); // No dependencies needed here
 
+
   // Auth State Change Listener - Refined Logic
   useEffect(() => {
     // Initial check for Firebase initialization
@@ -172,6 +173,8 @@
     console.log("AuthProvider: Setting up onAuthStateChanged listener.");
     setLoading(true); // Set loading true when listener starts
 
+    let unmounted = false;
+
     const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
         console.log("onAuthStateChanged triggered. Auth User:", authUser?.uid || "null");
         // Reset errors on each auth state change
@@ -181,7 +184,7 @@
         if (authUser) {
             setUser(authUser);
             // Fetch profile *immediately* after detecting authUser
-             if(unmounted) return;
+            if(unmounted) return;
             const profile = await fetchUserProfile(authUser.uid);
             if (profile) {
                 setUserProfile(profile);
@@ -196,12 +199,12 @@
         } else {
             // User is signed out
             setUser(null);
-             if(unmounted) return;
+            if(unmounted) return;
             setUserProfile(null);
         }
-         if(unmounted) return;
+        if(unmounted) return;
         setLoading(false); // Set loading false *after* processing auth state and profile
-    },
+      },
     // Error handler for the listener itself (less common)
     (listenerError) => {
         console.error("onAuthStateChanged listener error:", listenerError);
@@ -215,7 +218,7 @@
     // Cleanup function
     return () => {
       console.log("AuthProvider: Cleaning up onAuthStateChanged listener.");
-         unmounted = true;
+        unmounted = true;
       unsubscribe();
+
     };
     // fetchUserProfile and createOrUpdateUserProfile are stable due to useCallback
   }, [fetchUserProfile, createOrUpdateUserProfile]);
