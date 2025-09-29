import React from "react";
import { Container, Box, Typography } from "@mui/material";

export default function Home() {
  return (
    <Container>
      <Box sx={{ mt: 5, textAlign: "center" }}>
        <Typography variant="h4">Bem-vindo ao B3Finance</Typography>
        <Typography sx={{ mt: 2 }}>
          Seu painel de análise e investimentos
        </Typography>
      </Box>
    </Container>
  );
}
