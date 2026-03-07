import { BagProvider } from "./context/BagContext";
import { Layout } from "./components/Layout";

/**
 * Root component of the application.
 * 
 * Provides the BagContext to the entire application and renders the main Layout.
 */
function App() {
  return (
    <BagProvider>
      <Layout />
    </BagProvider>
  );
}

export default App;
