import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Studio from "./pages/Studio";
import Preview from "./pages/Preview";
import "@/App.css";
import "@/modern-mobile.css";

function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/generate" element={<Studio />} />
          <Route path="/preview" element={<Preview />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

export default App;
