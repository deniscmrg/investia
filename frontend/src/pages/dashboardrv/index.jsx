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
import { Chip } from "@mui/material";
import * as XLSX from "xlsx";
import api, { getRecomendacoesIA } from "../../services/api";
import { useNavigate } from "react-router-dom";
import OperacaoModal from "../../components/OperacaoModal";

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

const getVariacaoDiaColor = (v) => {
  const num = Number(v);
  if (!Number.isFinite(num) || num === 0) return undefined;
  return num > 0 ? "success.main" : "error.main";
};

const normalizeStatusLabel = (val) => {
  if (!val || val === "manual") return "n/d";
  return val;
};

export default function DashboardRV() {
  const navigate = useNavigate();
  const [tabIndex, setTabIndex] = useState(0);
  const [posicionadas, setPosicionadas] = useState([]);
  const [statusById, setStatusById] = useState({});
  const [patrimonio, setPatrimonio] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qtdPosicionadasByCliente, setQtdPosicionadasByCliente] = useState({});
  const [acoesDisponiveis, setAcoesDisponiveis] = useState([]);
  const [operacaoModalOpen, setOperacaoModalOpen] = useState(false);
  const [operacaoSelecionada, setOperacaoSelecionada] = useState(null);
  const [operacaoCliente, setOperacaoCliente] = useState({ id: null, nome: "" });
  const [operacaoCarregandoId, setOperacaoCarregandoId] = useState(null);

  // Recomendações IA direcionais
  const [iaCompras, setIaCompras] = useState([]);
  const [iaVendas, setIaVendas] = useState([]);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaMinProb, setIaMinProb] = useState(0.4);
  const [iaOrderCompra, setIaOrderCompra] = useState("asc");
  const [iaOrderByCompra, setIaOrderByCompra] = useState("acao_ticker");
  const [iaOrderVenda, setIaOrderVenda] = useState("asc");
  const [iaOrderByVenda, setIaOrderByVenda] = useState("acao_ticker");

  // filtros
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");

  // sort
  const [order, setOrder] = useState("asc");
  const [orderBy, setOrderBy] = useState("cliente");
  const [orderPat, setOrderPat] = useState("asc");
  const [orderByPat, setOrderByPat] = useState("codigo");
  const [orderRec, setOrderRec] = useState("asc");
  const [orderByRec, setOrderByRec] = useState("ticker");

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };
  const handleRequestSortPatrimonio = (property) => {
    const isAsc = orderByPat === property && orderPat === "asc";
    setOrderPat(isAsc ? "desc" : "asc");
    setOrderByPat(property);
  };
  const handleRequestSortRecs = (property) => {
    const isAsc = orderByRec === property && orderRec === "asc";
    setOrderRec(isAsc ? "desc" : "asc");
    setOrderByRec(property);
  };
  const handleRequestSortIaCompra = (property) => {
    const isAsc =
      iaOrderByCompra === property && iaOrderCompra === "asc";
    setIaOrderCompra(isAsc ? "desc" : "asc");
    setIaOrderByCompra(property);
  };
  const handleRequestSortIaVenda = (property) => {
    const isAsc = iaOrderByVenda === property && iaOrderVenda === "asc";
    setIaOrderVenda(isAsc ? "desc" : "asc");
    setIaOrderByVenda(property);
  };

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const [res1, res2, res3] = await Promise.all([
        api("dashboard-rv/"),
        api("patrimonio-disponivel/"),
        api("recomendacoes/"),
      ]);
      const posicoes = res1?.posicionadas || [];
      setPosicionadas(posicoes);
      const statusMap = {};
      posicoes.forEach((op) => {
        if (op?.id == null) return;
        const status = normalizeStatusLabel(op.status);
        if (status) {
          statusMap[op.id] = status;
        }
      });
      setStatusById(statusMap);
      setPatrimonio(res2 || []);
      setRecs(res3 || []);
    } catch (err) {
      console.error("Erro ao buscar dashboard RV:", err);
      setPosicionadas([]);
      setPatrimonio([]);
      setRecs([]);
      setStatusById({});
    } finally {
      setLoading(false);
    }
  };

  const fetchRecsIA = async () => {
    setIaLoading(true);
    try {
      const [compras, vendas] = await Promise.all([
        getRecomendacoesIA({ tipo: "compra", minProb: iaMinProb }),
        getRecomendacoesIA({ tipo: "venda", minProb: iaMinProb }),
      ]);
      setIaCompras(compras || []);
      setIaVendas(vendas || []);
    } catch (err) {
      console.error("Erro ao buscar recomendações IA:", err);
    } finally {
      setIaLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    fetchRecsIA();
  }, []);

  useEffect(() => {
    const loadAcoes = async () => {
      try {
        const lista = await api("acoes/");
        setAcoesDisponiveis(lista || []);
      } catch (e) {
        console.error("Erro ao carregar ações:", e);
      }
    };
    loadAcoes();
  }, []);

  // quantidade de ações posicionadas por cliente calculada localmente
  useEffect(() => {
    const map = {};
    (posicionadas || []).forEach((op) => {
      const clienteId = op.cliente_id ?? op.cliente;
      const ticker = (op.acao ?? op.ticker ?? op.acao_nome ?? "").toString().trim().toUpperCase();
      if (!clienteId || !ticker) return;
      if (!map[clienteId]) map[clienteId] = new Set();
      map[clienteId].add(ticker);
    });
    const counts = Object.fromEntries(
      Object.entries(map).map(([id, set]) => [id, set.size])
    );
    setQtdPosicionadasByCliente(counts);
  }, [posicionadas]);

  const renderStatusChip = (label) => {
    let color = 'default';
    if (label === 'executada') color = 'success';
    else if (label === 'parcial') color = 'warning';
    else if (label === 'pendente') color = 'info';
    else if (label === 'falha') color = 'error';
    return <Chip size="small" label={label} color={color} variant={label==='n/d' ? 'outlined' : 'filled'} />;
  };

  const closeOperacaoModal = () => {
    setOperacaoModalOpen(false);
    setOperacaoSelecionada(null);
    setOperacaoCliente({ id: null, nome: "" });
  };

  const abrirEdicaoPosicao = async (op) => {
    if (!op?.id) return;
    setOperacaoCarregandoId(op.id);
    try {
      const detalhe = await api(`operacoes/${op.id}/`);
      const hojeISO = new Date().toISOString().slice(0, 10);
      const payload = {
        ...detalhe,
        data_venda: detalhe?.data_venda || hojeISO,
        preco_venda_unitario:
          detalhe?.preco_venda_unitario != null
            ? detalhe.preco_venda_unitario
            : detalhe?.valor_alvo ?? "",
      };
      setOperacaoSelecionada(payload);
      setOperacaoCliente({
        id: detalhe?.cliente ?? op.cliente_id ?? null,
        nome: op.cliente ?? "",
      });
      setOperacaoModalOpen(true);
    } catch (err) {
      console.error("Erro ao carregar operação:", err);
    } finally {
      setOperacaoCarregandoId(null);
    }
  };

  const handleAfterSaveOperacao = async () => {
    await fetchDashboard();
  };

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

  const patrimonioRows = (patrimonio || []).map((cli) => ({
    ...cli,
    qtd_acoes: qtdPosicionadasByCliente[cli.codigo] ?? 0,
  }));
  const sortedPatrimonio = stableSort(patrimonioRows, getComparator(orderPat, orderByPat));
  const recColumns = [
    { id: "ticker", label: "Ticker" },
    { id: "empresa", label: "Empresa" },
    { id: "setor", label: "Setor" },
    { id: "data", label: "Data" },
    {
      id: "variacao_dia",
      label: "% Hoje (atual/abertura)",
      type: "percent",
    },
    { id: "preco_compra", label: "Preço compra", type: "currency" },
    { id: "alvo_sugerido", label: "Alvo sugerido", type: "currency" },
    { id: "percentual_estimado", label: "% Estimado", type: "percent" },
    { id: "probabilidade", label: "Probabilidade", type: "percent" },
    { id: "vezes_atingiu_alvo_1m", label: "Vezes alvo 1m", type: "number" },
    { id: "cruza_medias", label: "Cruza médias", type: "bool" },
    { id: "obv_cres", label: "OBV ↑", type: "bool" },
    { id: "vol_acima_media", label: "Volume ↑", type: "bool" },
    { id: "wma602", label: "WMA602", type: "currency" },
    { id: "MIN", label: "MIN", type: "currency" },
    { id: "MAX", label: "MAX", type: "currency" },
    { id: "AMPLITUDE", label: "AMPLITUDE", type: "currency" },
    { id: "AMP_AxF", label: "AMP A×F", type: "currency" },
    { id: "AMP_MXxMN", label: "AMP MX×MN", type: "currency" },
    { id: "A_x_F", label: "A×F", type: "currency" },
    { id: "ALVO", label: "ALVO", type: "currency" },
    { id: "ALTA", label: "ALTA", type: "currency" },
    { id: "BAIXA", label: "BAIXA", type: "currency" },
  ];
  const formatRecCell = (row, col) => {
    const value = row?.[col.id];
    if (value == null || value === "") {
      return "-";
    }
    switch (col.type) {
      case "currency":
        return formatCurrencyBRL(value);
      case "percent":
        return formatPercentBR(value);
      case "bool":
        return value ? "✅" : "❌";
      case "number":
        return value;
      default:
        return value;
    }
  };
  const sortedRecs = stableSort(recs || [], getComparator(orderRec, orderByRec));
   const sortedIaCompras = stableSort(
    iaCompras || [],
    getComparator(iaOrderCompra, iaOrderByCompra)
  );
  const sortedIaVendas = stableSort(
    iaVendas || [],
    getComparator(iaOrderVenda, iaOrderByVenda)
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
  const sortedPosicionadas = stableSort(
    posicionadasFiltradas,
    getComparator(order, orderBy)
  );

  const limparFiltros = () => {
    setFiltroCliente("");
    setFiltroAcao("");
  };

  const exportPosicionadasXls = () => {
    if (!sortedPosicionadas.length) return;

    const headers = [
      "Cliente",
      "Ação",
      "Data Compra",
      "Preço Unitário",
      "Quantidade",
      "Valor Total Compra",
      "Preço Atual",
      "Máxima (dia)",
      "Mínima (dia)",
      "Variação (%)",
      "Valor Alvo",
      "Dias Posicionado",
      "Status",
    ];

    const linhas = sortedPosicionadas.map((op) => [
      op.cliente ?? "-",
      op.acao ?? "-",
      op.data_compra ?? "-",
      formatCurrencyBRL(op.preco_compra),
      op.quantidade ?? "-",
      formatCurrencyBRL(op.valor_total_compra),
      formatCurrencyBRL(op.preco_atual),
      formatCurrencyBRL(op.preco_max),
      formatCurrencyBRL(op.preco_min),
      formatPercentBR(op.lucro_percentual),
      formatCurrencyBRL(op.valor_alvo),
      op.dias_posicionado ?? "-",
      normalizeStatusLabel(op.status ?? statusById[op.id]),
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...linhas]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Posicionadas");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.download = `posicionadas_${stamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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

            <Box sx={{ display: "flex", gap: 1, ml: "auto" }}>
              <Button variant="outlined" color="primary" onClick={exportPosicionadasXls}>
                ⬇ Exportar Excel
              </Button>
              <Button variant="contained" color="primary" onClick={fetchDashboard}>
                🔄 Atualizar
              </Button>
            </Box>
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
                  { id: "preco_max", label: "Máxima (dia)" },
                  { id: "preco_min", label: "Mínima (dia)" },
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
                <TableCell>Status</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {sortedPosicionadas.map((op) => {
                const precoMax = op.preco_max != null ? Number(op.preco_max) : null;
                const precoMin = op.preco_min != null ? Number(op.preco_min) : null;
                const precoAtual = op.preco_atual != null ? Number(op.preco_atual) : null;
                const valorAlvo = op.valor_alvo != null ? Number(op.valor_alvo) : null;
                const atingiuAlvo =
                  valorAlvo != null && precoMax != null && precoMin != null &&
                  valorAlvo >= precoMin && valorAlvo <= precoMax;

                return (
                  <TableRow key={op.id}>
                    <TableCell>
                      {op.cliente_id ? (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => navigate(`/clientes/${op.cliente_id}/carteira`)}
                        >
                          {op.cliente}
                        </Button>
                      ) : (
                        op.cliente
                      )}
                    </TableCell>
                    <TableCell>{op.acao}</TableCell>
                    <TableCell>{op.data_compra ?? "-"}</TableCell>
                    <TableCell>{formatCurrencyBRL(op.preco_compra)}</TableCell>
                    <TableCell>{op.quantidade ?? "-"}</TableCell>
                    <TableCell>{formatCurrencyBRL(op.valor_total_compra)}</TableCell>
                    <TableCell>{formatCurrencyBRL(precoAtual)}</TableCell>
                    <TableCell>{formatCurrencyBRL(precoMax)}</TableCell>
                    <TableCell>{formatCurrencyBRL(precoMin)}</TableCell>
                    <TableCell
                      sx={{
                        color: (op.lucro_percentual ?? 0) >= 0 ? "green" : "red",
                      }}
                    >
                      {formatPercentBR(op.lucro_percentual)}
                    </TableCell>
                    <TableCell
                      sx={{
                        backgroundColor: atingiuAlvo
                          ? "rgba(252, 210, 0, 0.35)"
                          : "inherit",
                        fontWeight: atingiuAlvo ? 600 : "normal",
                      }}
                    >
                      {formatCurrencyBRL(valorAlvo)}
                    </TableCell>
                    <TableCell>{op.dias_posicionado ?? "-"}</TableCell>
                    <TableCell>
                      {renderStatusChip(normalizeStatusLabel(op.status ?? statusById[op.id]))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => abrirEdicaoPosicao(op)}
                        disabled={operacaoCarregandoId === op.id}
                      >
                        {operacaoCarregandoId === op.id ? "Abrindo..." : "Editar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}

      {/* =================== PATRIMÔNIO DISPONÍVEL =================== */}
      {tabIndex === 1 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sortDirection={orderByPat === "codigo" ? orderPat : false}>
                <TableSortLabel
                  active={orderByPat === "codigo"}
                  direction={orderByPat === "codigo" ? orderPat : "asc"}
                  onClick={() => handleRequestSortPatrimonio("codigo")}
                >
                  Código
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={orderByPat === "nome" ? orderPat : false}>
                <TableSortLabel
                  active={orderByPat === "nome"}
                  direction={orderByPat === "nome" ? orderPat : "asc"}
                  onClick={() => handleRequestSortPatrimonio("nome")}
                >
                  Nome
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={orderByPat === "patrimonio" ? orderPat : false}>
                <TableSortLabel
                  active={orderByPat === "patrimonio"}
                  direction={orderByPat === "patrimonio" ? orderPat : "asc"}
                  onClick={() => handleRequestSortPatrimonio("patrimonio")}
                >
                  Patrimônio
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={orderByPat === "total_consolidado" ? orderPat : false}>
                <TableSortLabel
                  active={orderByPat === "total_consolidado"}
                  direction={orderByPat === "total_consolidado" ? orderPat : "asc"}
                  onClick={() => handleRequestSortPatrimonio("total_consolidado")}
                >
                  Total Consolidado
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={orderByPat === "valor_disponivel" ? orderPat : false}>
                <TableSortLabel
                  active={orderByPat === "valor_disponivel"}
                  direction={orderByPat === "valor_disponivel" ? orderPat : "asc"}
                  onClick={() => handleRequestSortPatrimonio("valor_disponivel")}
                >
                  Valor Disponível
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={orderByPat === "qtd_acoes" ? orderPat : false}>
                <TableSortLabel
                  active={orderByPat === "qtd_acoes"}
                  direction={orderByPat === "qtd_acoes" ? orderPat : "asc"}
                  onClick={() => handleRequestSortPatrimonio("qtd_acoes")}
                >
                  Qtd Ações
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedPatrimonio.map((cli) => (
              <TableRow
                key={cli.codigo}
                hover
                onClick={() => navigate(`/clientes/${cli.codigo}/carteira`)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>{cli.codigo}</TableCell>
                <TableCell>{cli.nome}</TableCell>
                <TableCell>{formatCurrencyBRL(cli.patrimonio)}</TableCell>
                <TableCell>{formatCurrencyBRL(cli.total_consolidado)}</TableCell>
                <TableCell>{formatCurrencyBRL(cli.valor_disponivel)}</TableCell>
                <TableCell>{cli.qtd_acoes ?? '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* =================== RECOMENDAÇÕES =================== */}
      {tabIndex === 2 && (
        <Box>
          {/* Botão Atualizar recomendações clássicas */}
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

          {/* Tabela de recomendações atuais (modelo antigo) */}
          <Box sx={{ "& .MuiTableCell-root": { fontSize: "0.79rem" } }}>
            <Table>
              <TableHead>
                <TableRow>
                  {recColumns.map((col) => (
                    <TableCell
                      key={col.id}
                      sortDirection={orderByRec === col.id ? orderRec : false}
                    >
                      <TableSortLabel
                        active={orderByRec === col.id}
                        direction={orderByRec === col.id ? orderRec : "asc"}
                        onClick={() => handleRequestSortRecs(col.id)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {sortedRecs.length ? (
                  sortedRecs.map((r, i) => (
                    <TableRow key={i}>
                      {recColumns.map((col) => {
                        const rawVal = r?.[col.id];
                        const color =
                          col.id === "variacao_dia"
                            ? getVariacaoDiaColor(rawVal)
                            : undefined;
                        return (
                          <TableCell
                            key={col.id}
                            sx={color ? { color } : undefined}
                          >
                            {formatRecCell(r, col)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={recColumns.length} align="center">
                      Nenhuma recomendação encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>

          {/* Seção de Recomendações IA Direcionais */}
          <Box sx={{ mt: 6 }}>
            <Typography variant="h6" mb={2}>
              🤖 Recomendações IA Direcional (+5% / -5% em 10 pregões)
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <TextField
                label="Prob. mínima"
                type="number"
                size="small"
                value={iaMinProb}
                onChange={(e) => setIaMinProb(Number(e.target.value) || 0)}
                inputProps={{ step: 0.05, min: 0, max: 1 }}
                sx={{ maxWidth: 160 }}
              />
              <Button variant="outlined" onClick={fetchRecsIA}>
                Atualizar IA
              </Button>
            </Box>

            {iaLoading ? (
              <CircularProgress />
            ) : (
              <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 320 }}>
                  <Typography variant="subtitle1" mb={1}>
                    Compras (UP_FIRST)
                  </Typography>
                  <Table size="small">
                    <TableHead>
                  <TableRow>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "acao_ticker"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "acao_ticker"}
                        direction={
                          iaOrderByCompra === "acao_ticker"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("acao_ticker")
                        }
                      >
                        Ticker
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "prob_up"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "prob_up"}
                        direction={
                          iaOrderByCompra === "prob_up"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("prob_up")
                        }
                      >
                        Prob. UP
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "preco_entrada"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "preco_entrada"}
                        direction={
                          iaOrderByCompra === "preco_entrada"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("preco_entrada")
                        }
                      >
                        Preço entrada
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "variacao_dia"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "variacao_dia"}
                        direction={
                          iaOrderByCompra === "variacao_dia"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("variacao_dia")
                        }
                      >
                        Var. dia (%)
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "dias_equivalentes_selic"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={
                          iaOrderByCompra === "dias_equivalentes_selic"
                        }
                        direction={
                          iaOrderByCompra === "dias_equivalentes_selic"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra(
                            "dias_equivalentes_selic"
                          )
                        }
                      >
                        Dias SELIC
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "retorno_medio_selic_ativo"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={
                          iaOrderByCompra === "retorno_medio_selic_ativo"
                        }
                        direction={
                          iaOrderByCompra === "retorno_medio_selic_ativo"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra(
                            "retorno_medio_selic_ativo"
                          )
                        }
                      >
                        Ret. médio SELIC ativo
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "qtd_testes"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "qtd_testes"}
                        direction={
                          iaOrderByCompra === "qtd_testes"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("qtd_testes")
                        }
                      >
                        Qtd testes
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "qtd_acertos"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "qtd_acertos"}
                        direction={
                          iaOrderByCompra === "qtd_acertos"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("qtd_acertos")
                        }
                      >
                        Qtd acertos
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "hit_rate"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "hit_rate"}
                        direction={
                          iaOrderByCompra === "hit_rate"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("hit_rate")
                        }
                      >
                        Hit rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "maior_ganho_10d"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "maior_ganho_10d"}
                        direction={
                          iaOrderByCompra === "maior_ganho_10d"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("maior_ganho_10d")
                        }
                      >
                        Maior ganho 10d
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "maior_perda_10d"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "maior_perda_10d"}
                        direction={
                          iaOrderByCompra === "maior_perda_10d"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("maior_perda_10d")
                        }
                      >
                        Maior perda 10d
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "acao_setor"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "acao_setor"}
                        direction={
                          iaOrderByCompra === "acao_setor"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("acao_setor")
                        }
                      >
                        Setor
                      </TableSortLabel>
                    </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedIaCompras && sortedIaCompras.length ? (
                        sortedIaCompras.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell>{rec.acao_ticker}</TableCell>
                        <TableCell
                          sx={{
                            color: getVariacaoDiaColor(rec.variacao_dia),
                          }}
                        >
                              {Number(rec.prob_up || 0).toLocaleString(
                                "pt-BR",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}
                        </TableCell>
                        <TableCell>
                          {Number(rec.preco_entrada || 0).toLocaleString(
                            "pt-BR",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </TableCell>
                        <TableCell>
                          {rec.variacao_dia != null
                            ? `${Number(rec.variacao_dia).toLocaleString(
                                "pt-BR",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}%`
                            : "-"}
                        </TableCell>
                            <TableCell>
                              {rec.dias_equivalentes_selic ?? "-"}
                            </TableCell>
                            <TableCell>
                              {rec.retorno_medio_selic_ativo != null
                                ? `${Number(
                                    rec.retorno_medio_selic_ativo * 100
                                  ).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`
                                : "-"}
                            </TableCell>
                            <TableCell>{rec.qtd_testes ?? "-"}</TableCell>
                            <TableCell>{rec.qtd_acertos ?? "-"}</TableCell>
                            <TableCell>
                              {rec.hit_rate != null
                                ? `${Number(rec.hit_rate).toLocaleString(
                                    "pt-BR",
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}%`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {rec.maior_ganho_10d != null
                                ? `${Number(
                                    rec.maior_ganho_10d * 100
                                  ).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {rec.maior_perda_10d != null
                                ? `${Number(
                                    rec.maior_perda_10d * 100
                                  ).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`
                                : "-"}
                            </TableCell>
                            <TableCell>{rec.acao_setor || "-"}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={12} align="center">
                            Nenhuma recomendação de compra.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Box>

                <Box sx={{ flex: 1, minWidth: 320 }}>
                  <Typography variant="subtitle1" mb={1}>
                    Vendas (DOWN_FIRST)
                  </Typography>
                  <Table size="small">
                    <TableHead>
                    <TableRow>
                      <TableCell
                        sortDirection={
                          iaOrderByVenda === "acao_ticker"
                            ? iaOrderVenda
                            : false
                        }
                      >
                        <TableSortLabel
                          active={iaOrderByVenda === "acao_ticker"}
                          direction={
                            iaOrderByVenda === "acao_ticker"
                              ? iaOrderVenda
                              : "asc"
                          }
                          onClick={() =>
                            handleRequestSortIaVenda("acao_ticker")
                          }
                        >
                          Ticker
                        </TableSortLabel>
                      </TableCell>
                      <TableCell
                        sortDirection={
                          iaOrderByVenda === "prob_down"
                            ? iaOrderVenda
                            : false
                        }
                      >
                        <TableSortLabel
                          active={iaOrderByVenda === "prob_down"}
                          direction={
                            iaOrderByVenda === "prob_down"
                              ? iaOrderVenda
                              : "asc"
                          }
                          onClick={() =>
                            handleRequestSortIaVenda("prob_down")
                          }
                        >
                          Prob. DOWN
                        </TableSortLabel>
                      </TableCell>
                      <TableCell
                        sortDirection={
                          iaOrderByVenda === "preco_entrada"
                            ? iaOrderVenda
                            : false
                        }
                      >
                        <TableSortLabel
                          active={iaOrderByVenda === "preco_entrada"}
                          direction={
                            iaOrderByVenda === "preco_entrada"
                              ? iaOrderVenda
                              : "asc"
                          }
                          onClick={() =>
                            handleRequestSortIaVenda("preco_entrada")
                          }
                        >
                          Preço entrada
                        </TableSortLabel>
                      </TableCell>
                      <TableCell
                        sortDirection={
                          iaOrderByVenda === "variacao_dia"
                            ? iaOrderVenda
                            : false
                        }
                      >
                        <TableSortLabel
                          active={iaOrderByVenda === "variacao_dia"}
                          direction={
                            iaOrderByVenda === "variacao_dia"
                              ? iaOrderVenda
                              : "asc"
                          }
                          onClick={() =>
                            handleRequestSortIaVenda("variacao_dia")
                          }
                        >
                          Var. dia (%)
                        </TableSortLabel>
                      </TableCell>
                      <TableCell
                        sortDirection={
                          iaOrderByVenda === "dias_equivalentes_selic"
                            ? iaOrderVenda
                            : false
                        }
                      >
                        <TableSortLabel
                          active={
                            iaOrderByVenda === "dias_equivalentes_selic"
                          }
                          direction={
                            iaOrderByVenda === "dias_equivalentes_selic"
                              ? iaOrderVenda
                              : "asc"
                          }
                          onClick={() =>
                            handleRequestSortIaVenda(
                              "dias_equivalentes_selic"
                            )
                          }
                        >
                          Dias SELIC
                        </TableSortLabel>
                      </TableCell>
                        <TableCell
                          sortDirection={
                            iaOrderByVenda === "retorno_medio_selic_ativo"
                              ? iaOrderVenda
                              : false
                          }
                        >
                          <TableSortLabel
                            active={
                              iaOrderByVenda === "retorno_medio_selic_ativo"
                            }
                            direction={
                              iaOrderByVenda ===
                              "retorno_medio_selic_ativo"
                                ? iaOrderVenda
                                : "asc"
                            }
                            onClick={() =>
                              handleRequestSortIaVenda(
                                "retorno_medio_selic_ativo"
                              )
                            }
                          >
                            Ret. médio SELIC ativo
                          </TableSortLabel>
                        </TableCell>
                        <TableCell
                          sortDirection={
                            iaOrderByVenda === "qtd_testes"
                              ? iaOrderVenda
                              : false
                          }
                        >
                          <TableSortLabel
                            active={iaOrderByVenda === "qtd_testes"}
                            direction={
                              iaOrderByVenda === "qtd_testes"
                                ? iaOrderVenda
                                : "asc"
                            }
                            onClick={() =>
                              handleRequestSortIaVenda("qtd_testes")
                            }
                          >
                            Qtd testes
                          </TableSortLabel>
                        </TableCell>
                        <TableCell
                          sortDirection={
                            iaOrderByVenda === "qtd_acertos"
                              ? iaOrderVenda
                              : false
                          }
                        >
                          <TableSortLabel
                            active={iaOrderByVenda === "qtd_acertos"}
                            direction={
                              iaOrderByVenda === "qtd_acertos"
                                ? iaOrderVenda
                                : "asc"
                            }
                            onClick={() =>
                              handleRequestSortIaVenda("qtd_acertos")
                            }
                          >
                            Qtd acertos
                          </TableSortLabel>
                        </TableCell>
                        <TableCell
                          sortDirection={
                            iaOrderByVenda === "hit_rate"
                              ? iaOrderVenda
                              : false
                          }
                        >
                          <TableSortLabel
                            active={iaOrderByVenda === "hit_rate"}
                            direction={
                              iaOrderByVenda === "hit_rate"
                                ? iaOrderVenda
                                : "asc"
                            }
                            onClick={() =>
                              handleRequestSortIaVenda("hit_rate")
                            }
                          >
                            Hit rate
                          </TableSortLabel>
                        </TableCell>
                        <TableCell
                          sortDirection={
                            iaOrderByVenda === "maior_ganho_10d"
                              ? iaOrderVenda
                              : false
                          }
                        >
                          <TableSortLabel
                            active={iaOrderByVenda === "maior_ganho_10d"}
                            direction={
                              iaOrderByVenda === "maior_ganho_10d"
                                ? iaOrderVenda
                                : "asc"
                            }
                            onClick={() =>
                              handleRequestSortIaVenda("maior_ganho_10d")
                            }
                          >
                            Maior ganho 10d
                          </TableSortLabel>
                        </TableCell>
                        <TableCell
                          sortDirection={
                            iaOrderByVenda === "maior_perda_10d"
                              ? iaOrderVenda
                              : false
                          }
                        >
                          <TableSortLabel
                            active={iaOrderByVenda === "maior_perda_10d"}
                            direction={
                              iaOrderByVenda === "maior_perda_10d"
                                ? iaOrderVenda
                                : "asc"
                            }
                            onClick={() =>
                              handleRequestSortIaVenda("maior_perda_10d")
                            }
                          >
                            Maior perda 10d
                          </TableSortLabel>
                        </TableCell>
                        <TableCell
                          sortDirection={
                            iaOrderByVenda === "acao_setor"
                              ? iaOrderVenda
                              : false
                          }
                        >
                          <TableSortLabel
                            active={iaOrderByVenda === "acao_setor"}
                            direction={
                              iaOrderByVenda === "acao_setor"
                                ? iaOrderVenda
                                : "asc"
                            }
                            onClick={() =>
                              handleRequestSortIaVenda("acao_setor")
                            }
                          >
                            Setor
                          </TableSortLabel>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedIaVendas && sortedIaVendas.length ? (
                        sortedIaVendas.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell>{rec.acao_ticker}</TableCell>
                            <TableCell>
                              {Number(rec.prob_down || 0).toLocaleString(
                                "pt-BR",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}
                            </TableCell>
                          <TableCell
                            sx={{
                              color: getVariacaoDiaColor(rec.variacao_dia),
                            }}
                          >
                            {Number(rec.preco_entrada || 0).toLocaleString(
                              "pt-BR",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                          </TableCell>
                          <TableCell>
                            {rec.variacao_dia != null
                              ? `${Number(rec.variacao_dia).toLocaleString(
                                  "pt-BR",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}%`
                              : "-"}
                          </TableCell>
                            <TableCell>
                              {rec.dias_equivalentes_selic ?? "-"}
                            </TableCell>
                            <TableCell>
                              {rec.retorno_medio_selic_ativo != null
                                ? `${Number(
                                    rec.retorno_medio_selic_ativo * 100
                                  ).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`
                                : "-"}
                            </TableCell>
                            <TableCell>{rec.qtd_testes ?? "-"}</TableCell>
                            <TableCell>{rec.qtd_acertos ?? "-"}</TableCell>
                            <TableCell>
                              {rec.hit_rate != null
                                ? `${Number(rec.hit_rate).toLocaleString(
                                    "pt-BR",
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}%`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {rec.maior_ganho_10d != null
                                ? `${Number(
                                    rec.maior_ganho_10d * 100
                                  ).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {rec.maior_perda_10d != null
                                ? `${Number(
                                    rec.maior_perda_10d * 100
                                  ).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`
                                : "-"}
                            </TableCell>
                            <TableCell>{rec.acao_setor || "-"}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={12} align="center">
                            Nenhuma recomendação de venda.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      <OperacaoModal
        open={operacaoModalOpen}
        onClose={closeOperacaoModal}
        operacao={operacaoSelecionada}
        clienteId={operacaoCliente.id}
        clienteNome={operacaoCliente.nome}
        acoes={acoesDisponiveis}
        onAfterSave={handleAfterSaveOperacao}
      />

    </Box>
  );
}
