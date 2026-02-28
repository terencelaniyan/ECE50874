import { BagProvider } from "./context/BagContext";
import { Layout } from "./components/Layout";

function App() {
  return (
    <BagProvider>
      <Layout />
    </BagProvider>
  );
}

export default App;
