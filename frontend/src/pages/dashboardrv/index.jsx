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
import api from "../../services/api";
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

  // carrega quantidade total de ações posicionadas por cliente
  useEffect(() => {
    const loadQtdPosicionadas = async () => {
      try {
        const ids = Array.from(new Set((patrimonio || []).map((p) => p.codigo).filter(Boolean)));
        if (!ids.length) {
          setQtdPosicionadasByCliente({});
          return;
        }
        const results = await Promise.all(ids.map(async (id) => {
          try {
            const res = await api(`operacoes/?cliente=${id}`);
            const lista = res?.results || res || [];
            const abertos = lista.filter((op) => !op.data_venda);
            const symbols = new Set(
              abertos
                .map((op) => {
                  const raw = op.acao_nome ?? op.acao ?? op.ticker ?? op.symbol;
                  if (raw == null) return null;
                  return String(raw).trim().toUpperCase();
                })
                .filter(Boolean)
            );
            return [id, symbols.size];
          } catch (e) {
            return [id, 0];
          }
        }));
        setQtdPosicionadasByCliente(Object.fromEntries(results));
      } catch (e) {
        // silencioso
      }
    };
    loadQtdPosicionadas();
  }, [patrimonio]);

  // busca status por operação (GET operacoes/<id>/), usa serializer com 'status'
  useEffect(() => {
    const loadStatuses = async () => {
      try {
        const ids = Array.from(new Set((posicionadas || []).map((p) => p.id).filter(Boolean)));
        if (!ids.length) {
          setStatusById({});
          return;
        }
        const results = await Promise.all(ids.map(async (id) => {
          try {
            const res = await api(`operacoes/${id}/`);
            const raw = res?.status;
            const label = raw && raw !== 'manual' ? String(raw) : 'n/d';
            return [id, label];
          } catch (e) {
            return [id, 'n/d'];
          }
        }));
        const map = Object.fromEntries(results);
        setStatusById(map);
      } catch (e) {
        // silencioso
      }
    };
    loadStatuses();
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
      statusById[op.id] || "n/d",
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
                    <TableCell>{renderStatusChip(statusById[op.id] || 'n/d')}</TableCell>
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

        <Box sx={{ '& .MuiTableCell-root': { fontSize: '0.79rem' } }}>
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
                  {recColumns.map((col) => (
                    <TableCell key={col.id}>{formatRecCell(r, col)}</TableCell>
                  ))}
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
