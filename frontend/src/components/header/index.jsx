// src/components/Header.jsx
import React, { useState } from "react";
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


