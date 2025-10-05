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
  TextField,
  MenuItem,
  Button,
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

  // filtros
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");

  // sort
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
  }, []);

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

  // --- gera listas únicas de clientes e ações
  const clientesUnicos = [...new Set(posicionadas.map((p) => p.cliente))];
  const acoesUnicas = [...new Set(posicionadas.map((p) => p.acao))];

  // --- aplica filtros
  const posicionadasFiltradas = posicionadas.filter((op) => {
    const matchCliente = filtroCliente ? op.cliente === filtroCliente : true;
    const matchAcao = filtroAcao ? op.acao === filtroAcao : true;
    return matchCliente && matchAcao;
  });

  const limparFiltros = () => {
    setFiltroCliente("");
    setFiltroAcao("");
  };

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

      {/* =================== POSICIONADAS =================== */}
      {tabIndex === 0 && (
        <>
          {/* Filtros + Botão Atualizar */}
          <Box
            sx={{
              display: "flex",
              gap: 2,
              mb: 2,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <TextField
              select
              label="Filtrar por Cliente"
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Todos</MenuItem>
              {clientesUnicos.map((cli) => (
                <MenuItem key={cli} value={cli}>
                  {cli}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Filtrar por Ação"
              value={filtroAcao}
              onChange={(e) => setFiltroAcao(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Todas</MenuItem>
              {acoesUnicas.map((a) => (
                <MenuItem key={a} value={a}>
                  {a}
                </MenuItem>
              ))}
            </TextField>

            {(filtroCliente || filtroAcao) && (
              <Button
                variant="outlined"
                color="secondary"
                onClick={limparFiltros}
              >
                Limpar Filtros
              </Button>
            )}

            <Button
              variant="contained"
              color="primary"
              onClick={fetchDashboard}
              sx={{ ml: "auto" }}
            >
              🔄 Atualizar
            </Button>
          </Box>

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
              {stableSort(posicionadasFiltradas, getComparator(order, orderBy)).map(
                (op) => (
                  <TableRow key={op.id}>
                    <TableCell>{op.cliente}</TableCell>
                    <TableCell>{op.acao}</TableCell>
                    <TableCell>{op.data_compra ?? "-"}</TableCell>
                    <TableCell>{formatCurrencyBRL(op.preco_compra)}</TableCell>
                    <TableCell>{op.quantidade ?? "-"}</TableCell>
                    <TableCell>{formatCurrencyBRL(op.valor_total_compra)}</TableCell>
                    <TableCell>{formatCurrencyBRL(op.preco_atual)}</TableCell>
                    <TableCell
                      sx={{
                        color: (op.lucro_percentual ?? 0) >= 0 ? "green" : "red",
                      }}
                    >
                      {formatPercentBR(op.lucro_percentual)}
                    </TableCell>
                    <TableCell>{formatCurrencyBRL(op.valor_alvo)}</TableCell>
                    <TableCell>{op.dias_posicionado ?? "-"}</TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </>
      )}

      {/* =================== PATRIMÔNIO DISPONÍVEL =================== */}
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

      {/* =================== RECOMENDAÇÕES =================== */}
     {tabIndex === 2 && (
      <Box>
        {/* Botão Atualizar */}
        <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            color="primary"
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
          >
            🔄 Atualizar
          </Button>
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
                "MIN",
                "MAX",
                "AMPLITUDE",
                "AMP A×F",
                "AMP MX×MN",
                "A×F",
                "ALVO",
                "ALTA",
                "BAIXA",
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
                  <TableCell>{formatCurrencyBRL(r.wma602)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.MIN)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.MAX)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.AMPLITUDE)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.AMP_AxF)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.AMP_MXxMN)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.A_x_F)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.ALVO)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.ALTA)}</TableCell>
                  <TableCell>{formatCurrencyBRL(r.BAIXA)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={22} align="center">
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
