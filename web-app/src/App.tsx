import { SwipeDeck } from "./SwipeDeck";
import { OrchestrationView } from "./OrchestrationView";

function App() {
  if (window.location.pathname === "/orchestration") {
    return <OrchestrationView />;
  }

  const match = window.location.pathname.match(/^\/swipe\/([^/]+)/);
  const studentId = match?.[1];

  if (!studentId) {
    return (
      <div className="landing">
        ScholarFinder swipe deck is running.
        <br />
        Text the ScholarFinder iMessage line to get your personal link.
      </div>
    );
  }

  return <SwipeDeck studentId={studentId} />;
}

export default App;
