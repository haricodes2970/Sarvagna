/**
 * MapLobbyPage — map skin selector before entering a module.
 * Lets the user pick one of 6 static fantasy maps, then enter the module map.
 * (Full implementation coming next.)
 */
import { useNavigate, useParams } from "react-router-dom";

export default function MapLobbyPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center flex flex-col gap-4">
        <p className="text-slate-400 text-sm">Map Lobby — coming soon</p>
        <button
          onClick={() => navigate(`/modulemap/${subjectId}/${moduleNumber}`)}
          className="px-6 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400"
        >
          Enter Module Map
        </button>
      </div>
    </div>
  );
}
