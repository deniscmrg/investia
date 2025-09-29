
// src/App.jsx
import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/header";
import Login from "./pages/login";
import Clientes from "./pages/clientes";
import Carteira from "./pages/carteira";
import DashboardRV from "./pages/dashboardrv";
import Importacao from "./pages/importacao";
import Recomendacoes from "./pages/recomendacoes"


function App() {
  // Estado para controlar login
  const [token, setToken] = useState(localStorage.getItem("access_token"));
  const [username, setUsername] = useState(localStorage.getItem("username") || "");

  // Callback quando o login é bem-sucedido
  const handleLogin = ({ access, username }) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("username", username);
    setToken(access);
    setUsername(username);
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    setToken(null);
    setUsername("");
  };

  return (
    <Router>
      {token && <Header username={username} onLogout={handleLogout} />}
      <Routes>
        {!token ? (
          // Se não tiver token, mostra login em qualquer rota
          <Route path="*" element={<Login onLogin={handleLogin} />} />
        ) : (
          <>
            <Route path="/" element={<div style={{ marginTop: 100 }}>Dashboard</div>} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id/carteira" element={<Carteira />} />
            <Route path="/controle-rv" element={<DashboardRV />} />
            <Route path="/controle-robo" element={<div style={{ marginTop: 100 }}>Controle ROBÔ</div>} />
            <Route path="/ferramentas/importacao" element={<Importacao />} />
            <Route path="*" element={<Navigate to="/" />} />
            <Route path="/recomendacoes" element={<Recomendacoes />} />           
          </>
        )}
      </Routes>
    </Router>
  );
}

export default App;


