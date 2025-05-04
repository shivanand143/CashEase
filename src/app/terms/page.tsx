// src/app/terms/page.tsx
import * as React from 'react';

export default function TermsOfServicePage() {
  return (
    // Wrap content in a container div with padding
    <div className="container py-8">
      <div className="prose dark:prose-invert max-w-3xl mx-auto py-8 md:py-12">
        <h1>Terms of Service</h1>
        <p><strong>Last Updated:</strong> [Insert Date]</p>

        <p>
          Welcome to CashEase! These Terms of Service ("Terms") govern your use of the CashEase website, mobile application, and related services (collectively, the "Service"), operated by [Your Company Name] ("CashEase", "we", "us", or "our").
        </p>
        <p>
          Please read these Terms carefully before using the Service. By accessing or using the Service, you agree to be bound by these Terms. If you disagree with any part of the terms, then you may not access the Service.
        </p>

        <h2>1. Eligibility</h2>
        <p>
          You must be at least 18 years old [or the age of majority in your jurisdiction] to use the Service. By agreeing to these Terms, you represent and warrant that you meet this age requirement.
        </p>

        <h2>2. Account Registration</h2>
        <p>
          To access certain features of the Service, you must register for an account. You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete. You are responsible for safeguarding your password and for any activities or actions under your account. You agree to notify us immediately of any unauthorized use of your account.
        </p>

        <h2>3. Cashback Service</h2>
        <p>
          CashEase provides a service that allows registered users to earn cashback on purchases made at participating retailer websites ("Partner Retailers") after clicking through affiliate links provided on our Service.
        </p>
        <ul>
          <li>
            <strong>Tracking:</strong> To earn cashback, you must be logged into your CashEase account, click on a designated affiliate link for a Partner Retailer on our Service, and complete a qualifying purchase on the Partner Retailer's website within the same browsing session. Using other coupon codes, browser extensions, or clicking other links may interfere with tracking and invalidate your cashback eligibility.
          </li>
          <li>
            <strong>Cashback Rates:</strong> Cashback rates are set by CashEase and Partner Retailers and are subject to change without notice. We endeavor to keep rates updated, but discrepancies may occur. Cashback is typically calculated on the net purchase amount (excluding taxes, fees, shipping, gift-wrapping, discounts, or credits). Specific exclusions may apply depending on the Partner Retailer.
          </li>
          <li>
            <strong>Confirmation:</strong> Cashback initially tracks as "Pending" and is subject to confirmation by the Partner Retailer after their return/cancellation period expires. This process can take 10-60 days or longer. CashEase is not responsible for delays or non-confirmation by Partner Retailers. Cashback may be cancelled if the order is returned, cancelled, or fails to meet the offer terms.
          </li>
          <li>
            <strong>Accuracy:</strong> While we strive for accuracy, CashEase is not responsible for tracking failures due to technical issues, user error (e.g., disabled cookies, clicking other links), or actions by Partner Retailers or affiliate networks. We will investigate missing cashback claims in good faith but cannot guarantee cashback recovery.
          </li>
        </ul>

        <h2>4. Payouts</h2>
        <ul>
          <li>
            <strong>Threshold:</strong> You can request a payout once your "Confirmed" cashback balance reaches the minimum threshold specified on the Service (e.g., ₹250).
          </li>
          <li>
            <strong>Methods:</strong> Payout methods (e.g., bank transfer, gift cards) are subject to availability and may have associated processing times or fees (which will be disclosed).
          </li>
          <li>
            <strong>Accuracy of Details:</strong> You are responsible for providing accurate payment details. CashEase is not liable for payouts sent to incorrect accounts due to user error.
          </li>
          <li>
            <strong>Account Closure:</strong> We reserve the right to close accounts that are inactive or suspected of fraudulent activity. Unclaimed cashback in closed accounts may be forfeited.
          </li>
        </ul>

        <h2>5. User Conduct</h2>
        <p>You agree not to use the Service:</p>
        <ul>
          <li>For any unlawful purpose or in violation of any applicable laws.</li>
          <li>To engage in any fraudulent activity, including creating multiple accounts, manipulating clicks or purchases, or exploiting loopholes.</li>
          <li>To impersonate any person or entity or misrepresent your affiliation with any person or entity.</li>
          <li>To interfere with or disrupt the Service or servers or networks connected to the Service.</li>
          <li>To attempt to gain unauthorized access to the Service or other user accounts.</li>
        </ul>
        <p>Violation of these terms may result in suspension or termination of your account and forfeiture of any earned cashback.</p>

        <h2>6. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are and will remain the exclusive property of CashEase and its licensors. The Service is protected by copyright, trademark, and other laws of both India and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of CashEase.
        </p>

        <h2>7. Affiliate Disclosure</h2>
        <p>
          CashEase participates in affiliate marketing programs. When you click on links to Partner Retailers and make a purchase, we may earn a commission. This commission is used to fund the cashback we provide to you.
        </p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided on an "AS IS" and "AS AVAILABLE" basis. Your use of the Service is at your sole risk. CashEase disclaims all warranties, express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, secure, error-free, or that cashback tracking will always be successful.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          In no event shall CashEase, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from (i) your access to or use of or inability to access or use the Service; (ii) any conduct or content of any third party on the Service; (iii) any content obtained from the Service; and (iv) unauthorized access, use, or alteration of your transmissions or content, whether based on warranty, contract, tort (including negligence), or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose. Our maximum liability for any claim arising from your use of the Service shall be limited to the amount of confirmed, unpaid cashback in your account.
        </p>

        <h2>10. Governing Law</h2>
        <p>
          These Terms shall be governed and construed in accordance with the laws of India, without regard to its conflict of law provisions.
        </p>

        <h2>11. Changes to Terms</h2>
        <p>
          We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after any revisions become effective, you agree to be bound by the revised terms.
        </p>

        <h2>12. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at [Your Contact Email/Link].
        </p>
      </div>
    </div>
  );
}
