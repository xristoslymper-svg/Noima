// Transient UI status messages, never patient content.
export const noticeKeys={
  "Η αναφορά αποθηκεύτηκε. Ευχαριστούμε.": "settings.feedbackSaved",
  "Your feedback has been saved. Thank you.": "settings.feedbackSaved",
  "Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς. Ελέγξτε και τα ανεπιθύμητα.": "settings.passwordResetSent",
  "If an account exists with this email, you will receive a password reset link. Check your spam folder too.": "settings.passwordResetSent",
  "Ο κωδικός άλλαξε.": "settings.passwordUpdated",
  "Password changed.": "settings.passwordUpdated",
  "Η καταγραφή οριστικοποιήθηκε.": "visits.finalized",
  "The clinical record was finalized.": "visits.finalized",
  "Η καταγραφή αποθηκεύτηκε ως πρόχειρη και προστέθηκε στις εκκρεμότητές σας.": "visits.deferredNotice",
  "The record was saved as a draft and added to your pending tasks.": "visits.deferredNotice",
  "Το ραντεβού επιβεβαιώθηκε.": "calendar.bookingConfirmed",
  "The appointment is confirmed.": "calendar.bookingConfirmed",
  "Το ραντεβού αποθηκεύτηκε.": "calendar.appointmentSaved",
  "The appointment was saved.": "calendar.appointmentSaved",
  "Ο κωδικός άλλαξε. Συνδεθείτε με τον νέο κωδικό.": "settings.passwordUpdatedLogin",
  "Password changed. Sign in with your new password.": "settings.passwordUpdatedLogin",
  "Η σύνδεσή σας έληξε. Συνδεθείτε ξανά για να συνεχίσετε.": "settings.sessionExpired",
  "Your session has expired. Sign in again to continue.": "settings.sessionExpired",
  "Ελέγξτε τα εισερχόμενα και τα ανεπιθύμητα για το email επιβεβαίωσης. Αν έχετε ήδη λογαριασμό, συνδεθείτε ή χρησιμοποιήστε την επαναφορά κωδικού.": "settings.confirmationEmailHelp",
  "Check your inbox and spam folder for the confirmation email. If you already have an account, sign in or reset your password.": "settings.confirmationEmailHelp"
} as const;
