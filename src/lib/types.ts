--- a/src/lib/types.ts
+++ b/src/lib/types.ts
@@ -34,8 +34,11 @@
     };
 }
 
+
 export type CashbackType = 'percentage' | 'fixed';
 
+export type PayoutMethod = 'paypal' | 'bank_transfer' | 'gift_card';
+
 export interface Store {
   id: string; // Firestore document ID
   name: string;
