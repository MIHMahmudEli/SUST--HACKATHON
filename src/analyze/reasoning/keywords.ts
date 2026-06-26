// Keyword dictionaries for rule-based case_type detection. English + Bangla + common Banglish.
// These are intentionally broad; the engine combines them with transaction evidence,
// so a stray keyword alone rarely decides the case.

export const KW = {
  phishing: [
    'otp', 'pin', 'password', 'verification code', 'verify code',
    'asked for my', 'share my', 'account will be blocked', 'account blocked',
    'someone called', 'suspicious', 'scam', 'fraud call', 'phishing',
    'from bkash', 'from nagad', 'claiming to be', 'pretending',
    'ওটিপি', 'পিন', 'পাসওয়ার্ড', 'কোড চাইছে', 'ব্লক', 'প্রতারণা', 'ফোন দিয়ে', 'সন্দেহজনক',
  ],
  wrong_transfer: [
    'wrong number', 'wrong person', 'wrong recipient', 'wrong account',
    'sent to wrong', 'mistakenly sent', 'by mistake', 'typed it wrong', 'mistype',
    'didn\'t get it', 'did not get it', 'not received', "didn't receive",
    'ভুল নম্বর', 'ভুল মানুষ', 'ভুল করে', 'ভুলে পাঠিয়েছি', 'পায়নি',
  ],
  payment_failed: [
    'failed', 'transaction failed', 'payment failed', 'showed failed',
    'but balance deducted', 'balance was deducted', 'money deducted', 'cut from my balance',
    'ফেইল', 'ব্যর্থ', 'টাকা কেটে', 'ব্যালেন্স কেটে',
  ],
  refund_request: [
    'refund', 'return my money', 'give my money back', 'money back',
    'changed my mind', 'don\'t want it', 'cancel',
    'রিফান্ড', 'টাকা ফেরত', 'ফেরত চাই', 'বাতিল',
  ],
  duplicate_payment: [
    'twice', 'two times', 'double', 'duplicate', 'charged twice', 'deducted twice',
    'paid once', 'only paid once', 'two payments',
    'দুইবার', 'দুবার', 'ডাবল', 'দুটি',
  ],
  merchant_settlement_delay: [
    'settlement', 'settle', 'not settled', 'merchant account', 'my sales',
    'payout', 'disbursement',
    'সেটেলমেন্ট', 'সেটেল', 'বিক্রির টাকা',
  ],
  agent_cash_in_issue: [
    'agent', 'cash in', 'cash-in', 'cashin', 'deposited', 'deposit through agent',
    'agent said', 'balance not added', 'not reflected',
    'এজেন্ট', 'ক্যাশ ইন', 'জমা', 'ব্যালেন্সে আসেনি', 'ব্যালেন্সে যোগ হয়নি',
  ],
} as const;

// Refund intent that is explicitly a service-failure refund (vs. change-of-mind)
export const SERVICE_FAILURE_REFUND_HINTS = [
  'failed', 'deducted', 'not received', 'double', 'twice', 'duplicate',
];
