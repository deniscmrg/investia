import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  CircularProgress,
  Modal,
} from "@mui/material";
import api from "../../services/api";

// --- helpers de ordenação ---
function descendingComparator(a, b, orderBy) {
  const av = a?.[orderBy];
  const bv = b?.[orderBy];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof bv === "number" && typeof av === "number") return bv - av;
  if (String(bv) < String(av)) return -1;
  if (String(bv) > String(av)) return 1;
  return 0;
}
function getComparator(order, orderBy) {
  return order === "desc"
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}
function stableSort(array, comparator) {
  const stabilized = (array || []).map((el, index) => [el, index]);
  stabilized.sort((a, b) => {
    const cmp = comparator(a[0], b[0]);
    if (cmp !== 0) return cmp;
    return a[1] - b[1];
  });
  return stabilized.map((el) => el[0]);
}

// --- helpers de formatação ---
const formatCurrencyBRL = (v) =>
  v == null || isNaN(Number(v))
    ? "-"
    : new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(v));
const formatPercentBR = (v) =>
  v == null || isNaN(Number(v))
    ? "-"
    : `${Number(v).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}%`;

export default function DashboardRV() {
  const [tabIndex, setTabIndex] = useState(0);
  const [posicionadas, setPosicionadas] = useState([]);
  const [patrimonio, setPatrimonio] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);

  // sort state
  const [order, setOrder] = useState("asc");
  const [orderBy, setOrderBy] = useState("cliente");

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res1 = await api("dashboard-rv/");
      setPosicionadas(res1.posicionadas || []);
      const res2 = await api("patrimonio-disponivel/");
      setPatrimonio(res2 || []);
      const res3 = await api("recomendacoes/");
      setRecs(res3 || []);
    } catch (err) {
      console.error("Erro ao buscar dashboard RV:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, []);

  // modal overlay de loading
  const LoadingModal = () => (
    <Modal open={loading}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "rgba(0,0,0,0.3)",
        }}
      >
        <CircularProgress />
      </Box>
    </Modal>
  );

  return (
    <Box sx={{ mt: 12, px: 4 }}>
      <Typography variant="h4" mb={2}>
        Painel de Controle
      </Typography>

      <LoadingModal />

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)}>
          <Tab label="POSICIONADAS" />
          <Tab label="PATRIMÔNIO DISPONÍVEL" />
          <Tab label="RECOMENDAÇÕES" />
        </Tabs>
      </Box>

      {/* POSICIONADAS */}
      {tabIndex === 0 && (
        <Table>
          <TableHead>
            <TableRow>
              {[
                { id: "cliente", label: "Cliente" },
                { id: "acao", label: "Ação" },
                { id: "data_compra", label: "Data Compra" },
                { id: "preco_compra", label: "Preço Unitário" },
                { id: "quantidade", label: "Quantidade" },
                { id: "valor_total_compra", label: "Valor Total Compra" },
                { id: "preco_atual", label: "Preço Atual" },
                { id: "lucro_percentual", label: "Variação (%)" },
                { id: "valor_alvo", label: "Valor Alvo" },
                { id: "dias_posicionado", label: "Dias Posicionado" },
              ].map((col) => (
                <TableCell key={col.id}>
                  <TableSortLabel
                    active={orderBy === col.id}
                    direction={orderBy === col.id ? order : "asc"}
                    onClick={() => handleRequestSort(col.id)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {stableSort(posicionadas, getComparator(order, orderBy)).map((op) => (
              <TableRow key={op.id}>
                <TableCell>{op.cliente}</TableCell>
                <TableCell>{op.acao}</TableCell>
                <TableCell>{op.data_compra ?? "-"}</TableCell>
                <TableCell>{formatCurrencyBRL(op.preco_compra)}</TableCell>
                <TableCell>{op.quantidade ?? "-"}</TableCell>
                <TableCell>{formatCurrencyBRL(op.valor_total_compra)}</TableCell>
                <TableCell>{formatCurrencyBRL(op.preco_atual)}</TableCell>
                <TableCell
                  sx={{ color: (op.lucro_percentual ?? 0) >= 0 ? "green" : "red" }}
                >
                  {formatPercentBR(op.lucro_percentual)}
                </TableCell>
                <TableCell>{formatCurrencyBRL(op.valor_alvo)}</TableCell>
                <TableCell>{op.dias_posicionado ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* PATRIMÔNIO DISPONÍVEL */}
      {tabIndex === 1 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Patrimônio</TableCell>
              <TableCell>Total Consolidado</TableCell>
              <TableCell>Valor Disponível</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {patrimonio.map((cli) => (
              <TableRow key={cli.codigo}>
                <TableCell>{cli.codigo}</TableCell>
                <TableCell>{cli.nome}</TableCell>
                <TableCell>{formatCurrencyBRL(cli.patrimonio)}</TableCell>
                <TableCell>{formatCurrencyBRL(cli.total_consolidado)}</TableCell>
                <TableCell>{formatCurrencyBRL(cli.valor_disponivel)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

           {/* RECOMENDAÇÕES */}
      {tabIndex === 2 && (
        <Box>
          <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await api("recomendacoes/", { method: "POST" });
                  const res = await api("recomendacoes/");
                  setRecs(res || []);
                } catch (err) {
                  console.error("Erro ao atualizar recomendações:", err);
                } finally {
                  setLoading(false);
                }
              }}
              style={{
                background: "#007bff",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              🔄 Atualizar
            </button>
          </Box>

          <Table>
            <TableHead>
              <TableRow>
                {[
                  "Ticker",
                  "Empresa",
                  "Setor",
                  "Data",
                  "Preço compra",
                  "Alvo sugerido",
                  "% Estimado",
                  "Probabilidade",
                  "Vezes alvo 1m",
                  "Cruza médias",
                  "OBV ↑",
                  "Volume ↑",
                  "WMA602",
                  "Origem",
                ].map((h, idx) => (
                  <TableCell key={idx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {recs.length ? (
                recs.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.ticker}</TableCell>
                    <TableCell>{r.empresa}</TableCell>
                    <TableCell>{r.setor}</TableCell>
                    <TableCell>{r.data}</TableCell>
                    <TableCell>{formatCurrencyBRL(r.preco_compra)}</TableCell>
                    <TableCell>{formatCurrencyBRL(r.alvo_sugerido)}</TableCell>
                    <TableCell>{formatPercentBR(r.percentual_estimado)}</TableCell>
                    <TableCell>{formatPercentBR(r.probabilidade)}</TableCell>
                    <TableCell>{r.vezes_atingiu_alvo_1m}</TableCell>
                    <TableCell>{r.cruza_medias ? "✅" : "❌"}</TableCell>
                    <TableCell>{r.obv_cres ? "✅" : "❌"}</TableCell>
                    <TableCell>{r.vol_acima_media ? "✅" : "❌"}</TableCell>
                    <TableCell>{r.wma602 ? "✅" : "❌"}</TableCell>
                    <TableCell>{r.origem}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={14} align="center">
                    Nenhuma recomendação encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}

    </Box>
  );
}
