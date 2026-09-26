import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import "./index.css";
import { AssistPage } from "./features/assist/AssistPage.tsx";
import { ChatPage } from "./features/chat/ChatPage.tsx";
import { Layout } from "./routes/Layout.tsx";
import { NewAssist } from "./routes/NewAssist.tsx";
import { NewChat } from "./routes/NewChat.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <NewChat /> },
      { path: "/c/:id", element: <ChatPage /> },
      { path: "/assist", element: <NewAssist /> },
      { path: "/a/:id", element: <AssistPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
