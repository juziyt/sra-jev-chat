import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { useCreateConversation } from "../queries.ts";

/** Creates an assist session once on mount and redirects to it. */
export function NewAssist() {
  const create = useCreateConversation();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void create.mutateAsync("assist").then((c) => navigate(`/a/${c.id}`, { replace: true }));
  }, [create, navigate]);

  return (
    <div className="grid flex-1 place-items-center">
      <span className="loading loading-dots loading-lg" />
    </div>
  );
}
