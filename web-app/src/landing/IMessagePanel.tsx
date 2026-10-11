interface Msg {
  from: "student" | "boss";
  text: string;
  time: string;
  chips?: string[];
}

// The real 7-question onboarding flow (src/boss/onboarding.ts), plus the call-question
// customization step and an outcome summary — both built this session, not aspirational.
// Hand-authored realistic sample, same as the rest of this mockup's placeholder content.
const THREAD: Msg[] = [
  { from: "student", text: "hey, let's get started", time: "9:41 AM" },
  {
    from: "boss",
    text: "Hey — I'm Scholafinder. I'll find US universities that actually take international students and actually fund them, then handle the research and outreach for you.\n\nA few quick questions first.\n\nFirst up: what's your vibe for campus culture — startup energy, corporate/professional, liberal arts, research-heavy, or more arts-focused?",
    time: "9:41 AM",
    chips: ["Startup energy", "Liberal arts", "Research-heavy"],
  },
  { from: "student", text: "startup energy for sure", time: "9:42 AM" },
  { from: "boss", text: "Urban, suburban, or rural — where do you actually want to be?", time: "9:42 AM" },
  { from: "student", text: "urban, definitely", time: "9:42 AM" },
  {
    from: "boss",
    text: "Let's talk money: full ride, full tuition only, partial aid, or are you open to anything that gets the number down?",
    time: "9:43 AM",
    chips: ["Full ride", "Full tuition", "Open to anything"],
  },
  { from: "student", text: "full ride honestly, that's the dream", time: "9:43 AM" },
  { from: "boss", text: "Got a world-ranking range in mind? (“top 50”, “100-300”, whatever ballpark you're aiming for)", time: "9:44 AM" },
  { from: "student", text: "top 200 ish", time: "9:44 AM" },
  { from: "boss", text: "What do you want to study — and does that subject's own ranking matter to you, or mostly the school's overall name?", time: "9:45 AM" },
  { from: "student", text: "computer science, subject ranking matters more", time: "9:45 AM" },
  { from: "boss", text: "SAT score — actual or expected? Text “skip” if it doesn't apply to you.", time: "9:45 AM" },
  { from: "student", text: "1450", time: "9:46 AM" },
  { from: "boss", text: "Last one — IELTS score, actual or expected? “skip” works here too if it's not applicable.", time: "9:46 AM" },
  { from: "student", text: "7.5", time: "9:46 AM" },
  {
    from: "boss",
    text: "Found 9 universities that actually fit what you're after — go swipe through them: scholafinder.app/swipe/9fe9…\n\nRight (or yes) on the ones you want, and the second you do I'll start digging deeper and reaching out to admissions. Text me “submitted <university>” once you've actually applied.",
    time: "9:47 AM",
  },
  { from: "student", text: "submitted Florida State University 🎉", time: "9:51 AM" },
  {
    from: "boss",
    text: "Nice! Before I reach out to Florida State's admissions — anything specific you want me to ask, like a certain scholarship or program? Just reply, or say “go ahead” and I'll use my usual questions.",
    time: "9:51 AM",
  },
  { from: "student", text: "ask about the presidential scholarship for international students", time: "9:52 AM" },
  {
    from: "boss",
    text: "On it — calling and emailing Florida State now with that question, plus my usual ones about aid eligibility and deadlines. I'll let you know what they say.",
    time: "9:52 AM",
  },
  {
    from: "boss",
    text: "Heard back from Florida State's admissions: international students are eligible for the Presidential Scholarship, but it's merit-based and separate from need-based aid — decisions go out mid-March.",
    time: "11:20 AM",
  },
];

export function IMessagePanel() {
  return (
    <div className="sf-imsg-phone">
      <div className="sf-imsg-bar">
        <img className="sf-imsg-avatar" src="/brand/mascot.webp" alt="" />
        <span className="sf-imsg-bar-name">Scholafinder</span>
        <span className="sf-imsg-bar-sub">iMessage</span>
      </div>
      <div className="sf-imsg-thread">
        {THREAD.map((m, i) => (
          <div className={`sf-imsg-row ${m.from}`} key={i}>
            <div className="sf-imsg-bubble">{m.text}</div>
            {m.chips && (
              <div className="sf-imsg-chips">
                {m.chips.map((chip) => (
                  <span className="sf-imsg-chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
            )}
            <div className="sf-imsg-time">{m.time}</div>
          </div>
        ))}
        <div className="sf-imsg-row boss">
          <div className="sf-imsg-typing">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
