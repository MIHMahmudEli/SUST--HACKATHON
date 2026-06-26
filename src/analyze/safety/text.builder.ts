import { Injectable } from '@nestjs/common';
import { Decision } from '../reasoning/reasoning.engine';

export interface DraftText {
  agent_summary: string;
  recommended_next_action: string;
  customer_reply: string;
  appendCredentialNote: boolean; // merchant-tone replies opt out
}

const NOTE_EN = ' Please do not share your PIN or OTP with anyone.';
const NOTE_BN = ' অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।';

@Injectable()
export class TextBuilder {
  // Deterministic, always-safe drafts. The LLM layer may replace agent_summary /
  // customer_reply, but only if its output passes the SafetyGuard; otherwise these stand.
  build(d: Decision): DraftText {
    const id = d.relevant_transaction_id;
    const amount = d.amount;
    const cp = d.matched?.counterparty;
    const bn = d.language === 'bn';

    // Already-reversed: state the factual ledger status (safe — not a promise of action)
    // and route to verification rather than confirming a new refund.
    if (d.matched?.status === 'reversed') {
      return {
        agent_summary: `Customer reports an issue with ${money(amount)} (${id}), but the transaction status is 'reversed' — the amount appears to have already been returned. Verify settlement of the reversal.`,
        recommended_next_action: `Confirm that the reversal of ${id} has settled to the customer's balance. If the customer has not received it, escalate to the relevant team for verification through official channels.`,
        customer_reply: bn
          ? `আমাদের রেকর্ড অনুযায়ী লেনদেন ${id} ইতিমধ্যে রিভার্স করা হয়েছে। আপনি যদি ফেরত পরিমাণটি না পেয়ে থাকেন, আমাদের দল অফিসিয়াল চ্যানেলে বিষয়টি যাচাই করবে।`
          : `Our records indicate that transaction ${id} was reversed. If you have not yet received the reversed amount, our team will verify this for you through official support channels.`,
        appendCredentialNote: true,
      };
    }

    switch (d.case_type) {
      case 'phishing_or_social_engineering':
        return {
          agent_summary:
            'Customer reports an unsolicited contact claiming to be from the company and requesting credentials (e.g. OTP). Likely social engineering attempt; verify and log.',
          recommended_next_action:
            'Escalate to fraud_risk immediately. Reassure the customer the company never asks for OTP/PIN. Log the reported number/sender for fraud pattern analysis.',
          customer_reply: bn
            ? 'কোনো তথ্য শেয়ার করার আগে যোগাযোগ করার জন্য ধন্যবাদ। আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড চাই না। কেউ নিজেকে আমাদের প্রতিনিধি দাবি করলেও এগুলো শেয়ার করবেন না। আমাদের ফ্রড টিমকে বিষয়টি জানানো হয়েছে।'
            : 'Thank you for reaching out before sharing any information. We never ask for your PIN, OTP, or password under any circumstances. Please do not share these with anyone, even if they claim to be from us. Our fraud team has been notified of this incident.',
          appendCredentialNote: false,
        };

      case 'wrong_transfer': {
        if (!id) {
          return {
            agent_summary:
              'Customer reports a transfer to the wrong/unintended recipient, but the relevant transaction could not be uniquely identified from the provided history.',
            recommended_next_action:
              'Ask the customer for the recipient number and approximate time to identify the correct transaction. Do not initiate a dispute until the transaction is confirmed.',
            customer_reply: bn
              ? 'যোগাযোগ করার জন্য ধন্যবাদ। উল্লিখিত লেনদেনটি নিশ্চিত করতে অনুগ্রহ করে প্রাপকের নম্বর ও আনুমানিক সময় জানান।'
              : 'Thank you for reaching out. To identify the correct transaction, could you please share the recipient number and the approximate time of the transfer?',
            appendCredentialNote: true,
          };
        }
        return {
          agent_summary: `Customer reports sending ${money(amount)} via ${id}${cp ? ` to ${cp}` : ''}, which they now believe was the wrong recipient.${d.evidence_verdict === 'inconsistent' ? ' History shows prior transfers to the same recipient, suggesting an established counterparty.' : ''}`,
          recommended_next_action:
            d.evidence_verdict === 'inconsistent'
              ? `Flag for human review. Verify with the customer whether ${id} was genuinely a wrong transfer given the established pattern with this recipient.`
              : `Verify ${id} details with the customer and initiate the wrong-transfer dispute workflow per policy.`,
          customer_reply: bn
            ? `আপনার লেনদেন ${id} সম্পর্কে আমরা অবগত হয়েছি। আমাদের ডিসপিউট টিম বিষয়টি পর্যালোচনা করে অফিসিয়াল চ্যানেলে আপনার সাথে যোগাযোগ করবে।`
            : `We have noted your concern about transaction ${id}. Our dispute team will review the case and contact you through official support channels.`,
          appendCredentialNote: true,
        };
      }

      case 'payment_failed':
        return {
          agent_summary: `Customer attempted a ${money(amount)} payment (${id ?? 'transaction'}) which failed, but reports the balance was deducted. Requires payments operations investigation.`,
          recommended_next_action: `Investigate ${id ?? 'the transaction'} ledger status. If balance was deducted on a failed payment, initiate the automatic reversal flow within standard SLA.`,
          customer_reply: bn
            ? `আমরা লক্ষ্য করেছি যে লেনদেন ${id ?? ''} এর কারণে অপ্রত্যাশিতভাবে ব্যালেন্স কাটা যেতে পারে। আমাদের পেমেন্টস টিম বিষয়টি যাচাই করবে এবং উপযুক্ত পরিমাণ অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে।`
            : `We have noted that transaction ${id ?? ''} may have caused an unexpected balance deduction. Our payments team will review the case and any eligible amount will be returned through official channels.`,
          appendCredentialNote: true,
        };

      case 'duplicate_payment':
        return {
          agent_summary: `Customer reports a duplicate payment. Two identical ${money(amount)} payments appear close together; ${id} is likely the duplicate.`,
          recommended_next_action: `Verify the duplicate with payments_ops. If the biller confirms only one payment was received, initiate reversal of ${id}.`,
          customer_reply: bn
            ? `আমরা লেনদেন ${id} এর সম্ভাব্য ডুপ্লিকেট পেমেন্ট লক্ষ্য করেছি। আমাদের পেমেন্টস টিম বিলারের সাথে যাচাই করবে এবং উপযুক্ত পরিমাণ অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে।`
            : `We have noted the possible duplicate payment for transaction ${id}. Our payments team will verify with the biller and any eligible amount will be returned through official channels.`,
          appendCredentialNote: true,
        };

      case 'agent_cash_in_issue':
        return {
          agent_summary: `Customer reports ${money(amount)} cash-in${cp ? ` via ${cp}` : ''} (${id ?? 'transaction'}) not reflected in balance. Pending/unsettled status; agent claims funds were sent.`,
          recommended_next_action: `Investigate ${id ?? 'the transaction'} status with agent operations. Confirm settlement state and resolve within the standard cash-in SLA.`,
          customer_reply: bn
            ? `আপনার লেনদেন ${id ?? ''} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের এজেন্ট অপারেশন্স দল এটি দ্রুত যাচাই করবে এবং অফিসিয়াল চ্যানেলে আপনাকে জানাবে।`
            : `We have noted your concern about transaction ${id ?? ''}. Our agent operations team will verify this promptly and update you through official support channels.`,
          appendCredentialNote: true,
        };

      case 'merchant_settlement_delay':
        return {
          agent_summary: `Merchant reports ${money(amount)} settlement (${id ?? 'transaction'}) delayed beyond the expected window. Settlement status is pending.`,
          recommended_next_action: `Route to merchant_operations to verify settlement batch status. If the batch is delayed, communicate a revised ETA to the merchant.`,
          customer_reply: `We have noted your concern about settlement ${id ?? ''}. Our merchant operations team will check the batch status and update you on the expected settlement time through official channels.`,
          appendCredentialNote: false, // merchant business tone
        };

      case 'refund_request':
        return {
          agent_summary: `Customer requests a refund of ${money(amount)}${id ? ` for ${id}` : ''} (change of mind). Not a service failure.`,
          recommended_next_action:
            'Inform the customer that refund eligibility depends on the merchant\'s own policy. Provide guidance on contacting the merchant directly for a refund.',
          customer_reply: bn
            ? 'যোগাযোগ করার জন্য ধন্যবাদ। সম্পন্ন হওয়া মার্চেন্ট পেমেন্টের রিফান্ড মার্চেন্টের নিজস্ব নীতির উপর নির্ভর করে। আমরা সরাসরি মার্চেন্টের সাথে যোগাযোগ করার পরামর্শ দিচ্ছি।'
            : "Thank you for reaching out. Refunds for completed merchant payments depend on the merchant's own policy. We recommend contacting the merchant directly. If you need help reaching them, please reply and we will guide you.",
          appendCredentialNote: true,
        };

      default:
        return {
          agent_summary:
            'Customer reports a vague concern without specifying a transaction, amount, or issue. Insufficient detail to identify any relevant transaction.',
          recommended_next_action:
            'Reply to the customer asking for specific details: which transaction, what amount, what went wrong, and approximate time.',
          customer_reply: bn
            ? 'যোগাযোগ করার জন্য ধন্যবাদ। দ্রুত সহায়তার জন্য অনুগ্রহ করে লেনদেন আইডি, সংশ্লিষ্ট পরিমাণ এবং কী সমস্যা হয়েছে তা সংক্ষেপে জানান।'
            : 'Thank you for reaching out. To help you faster, please share the transaction ID, the amount involved, and a short description of what went wrong.',
          appendCredentialNote: true,
        };
    }
  }
}

function money(amount: number | null): string {
  return amount != null ? `${amount} BDT` : 'an amount';
}

export { NOTE_EN, NOTE_BN };
