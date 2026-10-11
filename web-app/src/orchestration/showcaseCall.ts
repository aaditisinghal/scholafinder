/**
 * Hardcoded showcase call — a fixed, pre-recorded (ElevenLabs) transcript for the "ongoing call"
 * entry under the Call Gatherer box. Deliberately NOT live-generated: this is a guaranteed-good
 * sample to demo the call-agent concept reliably, separate from the real streaming call simulator
 * (callSimulatorAgent.ts) that runs during an actual swipe-yes or demo flow. Audio files are
 * pre-generated static assets in /public/showcase-call/ (see scripts/generate-showcase-call.mjs).
 */
export interface ShowcaseTurn {
  speaker: "caller" | "officer";
  text: string;
  audio: string;
}

export const SHOWCASE_UNIVERSITY = "Harvard University";

export const SHOWCASE_CALL: ShowcaseTurn[] = [
  { speaker: "caller", text: "Hi there, thanks for picking up. I'm calling on behalf of a prospective international student interested in Harvard. Do you have a couple minutes for some questions about financial aid?", audio: "/showcase-call/0-caller.mp3" },
  { speaker: "officer", text: "Of course, happy to help. Go ahead.", audio: "/showcase-call/1-officer.mp3" },
  { speaker: "caller", text: "Great. First question — are international students actually eligible for need-based financial aid, or is that only for U.S. citizens?", audio: "/showcase-call/2-caller.mp3" },
  { speaker: "officer", text: "International students are fully eligible. Harvard is need-blind in admissions and meets full demonstrated need for every admitted student, regardless of citizenship.", audio: "/showcase-call/3-officer.mp3" },
  { speaker: "caller", text: "That's great to hear. What does the application process actually look like for an international applicant trying to get that aid?", audio: "/showcase-call/4-caller.mp3" },
  { speaker: "officer", text: "You'll file the CSS Profile instead of the FAFSA, along with your family's tax documents or local equivalent. Our office reviews it alongside your admissions application, so there's no separate aid application.", audio: "/showcase-call/5-officer.mp3" },
  { speaker: "caller", text: "Got it. And when would the financial aid decision actually come out relative to admissions?", audio: "/showcase-call/6-caller.mp3" },
  { speaker: "officer", text: "Same time. For regular decision, both your admission letter and your aid package arrive together, typically late March.", audio: "/showcase-call/7-officer.mp3" },
  { speaker: "caller", text: "Perfect, that's exactly what I needed. One last thing — is the application fee waivable for students who can't afford it?", audio: "/showcase-call/8-caller.mp3" },
  { speaker: "officer", text: "Yes, fee waivers are available on request, no documentation needed beyond checking the box on the application. International or domestic, doesn't matter.", audio: "/showcase-call/9-officer.mp3" },
  { speaker: "caller", text: "Wonderful, thank you so much for your time today.", audio: "/showcase-call/10-caller.mp3" },
  { speaker: "officer", text: "Of course, good luck to your student. Have a great day.", audio: "/showcase-call/11-officer.mp3" },
];
