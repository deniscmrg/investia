// src/components/Header.jsx
import React, { useEffect, useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Menu,
  MenuItem,
  IconButton,
  Avatar,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { Link } from "react-router-dom";
import api from "../../services/api";

export default function Header({ username = "Usuário", onLogout = () => {} }) {
  // Menu do usuário (desktop)
  const [anchorUser, setAnchorUser] = useState(null);
  const handleUserOpen = (event) => setAnchorUser(event.currentTarget);
  const handleUserClose = () => setAnchorUser(null);

  // Menu Ferramentas (desktop)
  const [anchorFerramentas, setAnchorFerramentas] = useState(null);
  const handleFerramentasOpen = (event) => setAnchorFerramentas(event.currentTarget);
  const handleFerramentasClose = () => setAnchorFerramentas(null);

  // Menu mobile (hambúrguer)
  const [anchorMobile, setAnchorMobile] = useState(null);
  const handleMobileOpen = (event) => setAnchorMobile(event.currentTarget);
  const handleMobileClose = () => setAnchorMobile(null);

  const [indices, setIndices] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchIndices = async () => {
      try {
        const data = await api("indices/");
        if (!cancelled) {
          setIndices(data);
        }
      } catch (error) {
        if (!cancelled) {
          setIndices(null);
        }
        console.error("Falha ao carregar índices econômicos:", error);
      }
    };

    fetchIndices();
    const intervalId = setInterval(fetchIndices, 60 * 60 * 1000); // atualiza a cada 1h

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const formatIndexValue = (entry) => {
    if (!entry || entry.value == null) {
      return "--";
    }
    const value = Number(entry.value);
    const formattedValue = Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
    const dateLabel = entry.date ? ` (${entry.date})` : "";
    return `${formattedValue}${dateLabel}`;
  };

  const menuItems = [
    { label: "Painel de Controle", path: "/controle-rv" },
    { label: "Clientes", path: "/clientes" },
    // { label: "Controle ROBÔ", path: "/controle-robo" },

  ];

  return (
    <AppBar position="fixed" color="primary" sx={{ top: 0, left: 0, right: 0, height: 60 }}>
      <Toolbar
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "100%",
          px: 3,
        }}
      >
        {/* Logo à esquerda */}
        <Typography
          variant="h5"
          component={Link}
          to="/"
          sx={{ textDecoration: "none", color: "inherit", fontWeight: "bold" }}
        >
          Invest-IA
        </Typography>

        {/* Índices econômicos - desktop */}
        <Box
          sx={{
            flex: 1,
            display: { xs: "none", md: "flex" },
            justifyContent: "center",
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
            IPCA (12m): {formatIndexValue(indices?.ipca)} &nbsp;|&nbsp; IGP-M (12m): {formatIndexValue(indices?.igpm)} &nbsp;|&nbsp; SELIC: {formatIndexValue(indices?.selic)}
          </Typography>
        </Box>

        {/* Menu desktop */}
        <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}>
          {menuItems.map((item) => (
            <Button
              key={item.label}
              component={Link}
              to={item.path}
              color="inherit"
              sx={{ textTransform: "none", mx: 2, fontSize: "1rem" }}
            >
              {item.label}
            </Button>
          ))}

          {/* Ferramentas (dropdown) */}
          <Button
            color="inherit"
            onClick={handleFerramentasOpen}
            sx={{ textTransform: "none", mx: 2, fontSize: "1rem" }}
          >
            Ferramentas
          </Button>
          <Menu
            anchorEl={anchorFerramentas}
            open={Boolean(anchorFerramentas)}
            onClose={handleFerramentasClose}
          >
            <MenuItem
              component={Link}
              to="/ferramentas/importacao"
              onClick={handleFerramentasClose}
            >
              Importação
            </MenuItem>
          </Menu>

          {/* Usuário com dropdown */}
          <Button
            color="inherit"
            onClick={handleUserOpen}
            startIcon={
              <Avatar sx={{ width: 28, height: 28 }}>
                {(username && username[0]) ? username[0].toUpperCase() : "U"}
              </Avatar>
            }
            sx={{ textTransform: "none", ml: 3, fontSize: "1rem" }}
          >
            {username}
          </Button>
          <Menu anchorEl={anchorUser} open={Boolean(anchorUser)} onClose={handleUserClose}>
            <MenuItem onClick={handleUserClose}>Perfil</MenuItem>
            <MenuItem
              onClick={() => {
                handleUserClose();
                onLogout();
              }}
            >
              Sair
            </MenuItem>
          </Menu>
        </Box>

        {/* Índices - mobile */}
        <Box sx={{ display: { xs: "block", md: "none" }, textAlign: "center", flexGrow: 1 }}>
          <Typography variant="caption">
            IPCA (12m): {formatIndexValue(indices?.ipca)} | IGP-M (12m): {formatIndexValue(indices?.igpm)} | SELIC: {formatIndexValue(indices?.selic)}
          </Typography>
        </Box>

        {/* Menu mobile */}
        <Box sx={{ display: { xs: "flex", md: "none" } }}>
          <IconButton color="inherit" onClick={handleMobileOpen} aria-label="menu">
            <MenuIcon />
          </IconButton>
          <Menu
            anchorEl={anchorMobile}
            open={Boolean(anchorMobile)}
            onClose={handleMobileClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {menuItems.map((item) => (
              <MenuItem
                key={item.label}
                component={Link}
                to={item.path}
                onClick={handleMobileClose}
              >
                {item.label}
              </MenuItem>
            ))}

            {/* Ferramentas (sub-itens no mobile) */}
            <MenuItem
              component={Link}
              to="/ferramentas/importacao"
              onClick={handleMobileClose}
            >
              Ferramentas → Importação
            </MenuItem>

            <MenuItem onClick={handleMobileClose}>Perfil</MenuItem>
            <MenuItem
              onClick={() => {
                handleMobileClose();
                onLogout();
              }}
            >
              Sair
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
