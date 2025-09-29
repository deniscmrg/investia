// src/pages/Login.jsx
import { useState } from "react";
import { Box, TextField, Button, Typography } from "@mui/material";
import axios from "axios";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post("http://localhost:8000/api/token/", { username, password });
      localStorage.setItem("access_token", res.data.access);
      localStorage.setItem("username", res.data.username);
      onLogin(res.data); // avisa o App.jsx que login foi bem-sucedido
    } catch {
      setError("Usuário ou senha inválidos");
    }
  };

  return (
    <Box
      sx={{
        maxWidth: 400,
        mx: "auto",
        mt: 12,
        p: 4,
        border: "1px solid #ccc",
        borderRadius: 2,
        boxShadow: 3,
      }}
    >
      <Typography variant="h5" mb={2} textAlign="center">
        Login
      </Typography>
      {error && <Typography color="error" textAlign="center">{error}</Typography>}
      <form onSubmit={handleSubmit}>
        <TextField
          label="Usuário"
          fullWidth
          margin="normal"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label="Senha"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="contained" fullWidth sx={{ mt: 3 }}>
          Entrar
        </Button>
      </form>
    </Box>
  );
}
