// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

/**
 * Handles postbacks from affiliate networks.
 * Expects query parameters: click_id, order_id, amount, merchant_name (optional)
 */
exports.postback = functions.https.onRequest(async (req, res) => {
  const {
    click_id: clickId, // Standardize to camelCase
    order_id: orderId,
    amount: saleAmountStr, // Amount from affiliate network (sale amount)
    merchant_name: merchantName, // Optional: Name of the merchant
    // You might receive other parameters like currency, commission, item_list, etc.
  } = req.query;

  functions.logger.info("Postback received:", { query: req.query });

  if (!clickId || !orderId || !saleAmountStr) {
    functions.logger.error("Missing required parameters in postback:", { clickId, orderId, saleAmountStr });
    return res.status(400).send("Error: Missing required parameters (click_id, order_id, amount).");
  }

  const saleAmount = parseFloat(saleAmountStr);
  if (isNaN(saleAmount) || saleAmount <= 0) {
    functions.logger.error("Invalid sale amount in postback:", { saleAmountStr });
    return res.status(400).send("Error: Invalid sale amount.");
  }

  try {
    // 1. Find the original click document using the clickId field
    const clicksRef = db.collection("clicks");
    const clickQuery = clicksRef.where("clickId", "==", clickId).limit(1); // Query by 'clickId' field
    const clickSnapshot = await clickQuery.get();

    let clickData = null;
    let originalClickFirebaseId = null;

    if (!clickSnapshot.empty) {
      const clickDoc = clickSnapshot.docs[0];
      clickData = clickDoc.data();
      originalClickFirebaseId = clickDoc.id; // This is the Firestore document ID of the click
      functions.logger.info("Matching click found:", { clickId, originalClickFirebaseId });
    } else {
      functions.logger.warn("No matching click found for click_id (from postback):", clickId);
    }

    // 2. Create a "conversion" document
    const conversionData = {
      clickId: clickId, // The ID from the postback
      originalClickFirebaseId: originalClickFirebaseId, // Firestore ID of the matched click document
      userId: clickData?.userId || null,
      storeId: clickData?.storeId || null,
      storeName: clickData?.storeName || merchantName || "Unknown Store",
      orderId: orderId,
      saleAmount: saleAmount,
      status: clickData && clickData.userId ? "received" : "unmatched_click", // Mark if original click not found or user not identified
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      postbackData: req.query,
    };
    const conversionRef = await db.collection("conversions").add(conversionData);
    functions.logger.info("Conversion document created:", conversionRef.id);

    // Only proceed to create a transaction if the original click was matched AND has a userId
    if (clickData && clickData.userId && clickData.storeId) {
      let initialCashbackAmount = 0;
      let storeCashbackRate = "N/A";
      let storeCashbackType = "percentage"; // Default

      const storeDocRef = db.collection("stores").doc(clickData.storeId);
      const storeDoc = await storeDocRef.get();
      if (storeDoc.exists) {
        const storeData = storeDoc.data();
        storeCashbackRate = storeData.cashbackRate || "N/A";
        storeCashbackType = storeData.cashbackType || "percentage";
        const rateValue = parseFloat(storeData.cashbackRateValue);
        if (!isNaN(rateValue) && rateValue > 0) {
          if (storeData.cashbackType === "fixed") {
            initialCashbackAmount = rateValue;
          } else { // percentage
            initialCashbackAmount = (saleAmount * rateValue) / 100;
          }
          initialCashbackAmount = parseFloat(initialCashbackAmount.toFixed(2));
        }
      } else {
        functions.logger.warn("Store details not found for storeId:", clickData.storeId, "during transaction creation.");
      }

      const transactionData = {
        userId: clickData.userId,
        storeId: clickData.storeId,
        storeName: clickData.storeName || merchantName || (storeDoc.exists ? storeDoc.data().name : "Unknown Store"),
        orderId: orderId,
        clickId: clickId,
        conversionId: conversionRef.id,
        productDetails: clickData.productName || clickData.couponId || "General Purchase",
        transactionDate: admin.firestore.FieldValue.serverTimestamp(), // Or a date from postback if available & reliable
        reportedDate: admin.firestore.FieldValue.serverTimestamp(),
        saleAmount: saleAmount,
        cashbackRateApplied: storeCashbackRate,
        initialCashbackAmount: initialCashbackAmount,
        finalSaleAmount: saleAmount,
        finalCashbackAmount: initialCashbackAmount,
        currency: "INR",
        status: "pending",
        confirmationDate: null,
        paidDate: null,
        payoutId: null,
        rejectionReason: null,
        adminNotes: "Auto-created from affiliate postback.",
        notesToUser: `Your purchase with Order ID ${orderId} from ${clickData.storeName || merchantName || "store"} is being tracked.`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const transactionRef = await db.collection("transactions").add(transactionData);
      functions.logger.info("Transaction document created from conversion:", transactionRef.id);

      if (initialCashbackAmount > 0) {
        const userRef = db.collection("users").doc(clickData.userId);
        await userRef.update({
          pendingCashback: admin.firestore.FieldValue.increment(initialCashbackAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.info("User pendingCashback updated for userId:", clickData.userId, "amount:", initialCashbackAmount);
      }
      return res.status(200).send("OK (Conversion and Transaction processed)");
    } else {
      functions.logger.info("Skipping transaction creation for conversionId:", conversionRef.id, "due to unmatched click or missing user/store ID from click data.");
      return res.status(200).send("OK (Conversion logged, transaction/user update skipped)");
    }

  } catch (error) {
    functions.logger.error("Error processing postback:", error);
    return res.status(500).send("Internal Server Error");
  }
});
