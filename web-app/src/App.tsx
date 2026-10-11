import { SwipeDeck } from "./SwipeDeck";
import { OrchestrationView } from "./OrchestrationView";
import { LandingPage } from "./landing/LandingPage";

function App() {
  if (window.location.pathname === "/orchestration") {
    return <OrchestrationView />;
  }

  const match = window.location.pathname.match(/^\/swipe\/([^/]+)/);
  const studentId = match?.[1];

  if (!studentId) {
    return <LandingPage />;
  }

  return <SwipeDeck studentId={studentId} />;
}

export default App;
