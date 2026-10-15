import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./lib/wagmi";
import { CofheProvider } from "./lib/cofhe";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { TxPage } from "./pages/Tx";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <CofheProvider>
          <BrowserRouter>
            <Header />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/tx" element={<TxPage />} />
            </Routes>
          </BrowserRouter>
        </CofheProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
