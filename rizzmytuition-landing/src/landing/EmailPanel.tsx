const BODY_LINES = [
  "Hello Florida State University,",
  "I’m reaching out on behalf of a prospective international undergraduate student researching scholarship opportunities at Florida State University through Scholafinder, a platform that helps international applicants navigate U.S. financial aid.",
  "A few questions that weren’t fully covered on the website:",
];

const QUESTIONS = [
  "Does FSU offer full-ride scholarships to international students, and if so, through which program(s)?",
  "What are the eligibility requirements for international applicants specifically — GPA, standardized test scores, or other criteria?",
  "Is there any information you can share on the typical profile of full-ride recipients — average GPA, SAT/ACT/IELTS scores, or similar stats?",
  "Are there supplemental applications or additional materials required beyond the general admission application?",
];

export function EmailPanel() {
  return (
    <div className="sf-email-window">
      <div className="sf-email-titlebar">
        <span className="sf-email-dot red" />
        <span className="sf-email-dot yellow" />
        <span className="sf-email-dot green" />
        <span className="sf-email-titlebar-label">Draft + Send Admissions Email</span>
      </div>
      <div className="sf-email-meta">
        <div>
          <span>From</span>Scholafinder &lt;onboarding@scholafinder.app&gt;
        </div>
        <div>
          <span>To</span>financialaid@fsu.edu
        </div>
        <div>
          <span>Subject</span>Questions About Full-Ride Scholarships (FSU) &mdash; International Student
        </div>
      </div>
      <div className="sf-email-body">
        {BODY_LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <ol>
          {QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
        <p>Thank you for your time &mdash; any guidance is genuinely appreciated.</p>
        <p className="sf-email-sign">
          Best regards,
          <br />
          Scholafinder, on behalf of a prospective applicant
        </p>
      </div>
      <div className="sf-email-footer">Sent via Resend &middot; logged to outreach_emails</div>
    </div>
  );
}
