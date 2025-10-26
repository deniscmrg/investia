import {
  IconButton, Tooltip, Tabs, Tab,
  Box, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions, Button, MenuItem,
  Backdrop, CircularProgress, Stack, RadioGroup, FormControlLabel, Radio, FormLabel, Chip
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/api";

export default function Carteira() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const [operacoes, setOperacoes] = useState([]);
  const [acoesDisponiveis, setAcoesDisponiveis] = useState([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tabIndex, setTabIndex] = useState(0);

  const [resumo, setResumo] = useState(null);
  const [updatingQuotes, setUpdatingQuotes] = useState(false);

  // ---------- MT5 Nova Compra (modais) ----------
  const [openRecModal, setOpenRecModal] = useState(false);
  const [openNovaCompraModal, setOpenNovaCompraModal] = useState(false);
  const [recsDisponiveis, setRecsDisponiveis] = useState([]);
  const [recSelecionada, setRecSelecionada] = useState(null);

  const [execucao, setExecucao] = useState("mercado"); // mercado | limite
  const [modoEntrada, setModoEntrada] = useState("quantidade"); // quantidade | valor
  const [precoLimite, setPrecoLimite] = useState("");
  const [tpAlvo, setTpAlvo] = useState("");
  const [qtdDesejada, setQtdDesejada] = useState("");
  const [valorDesejado, setValorDesejado] = useState("");
  const [legsSugeridas, setLegsSugeridas] = useState([]);
  const [validacoesLegs, setValidacoesLegs] = useState([]);
  const [comprando, setComprando] = useState(false);
  const [groupId, setGroupId] = useState(null);
  const [compraStatus, setCompraStatus] = useState(null);
  const compraIntervalRef = useRef(null);

  // form
  const [acao, setAcao] = useState("");
  const [dataCompra, setDataCompra] = useState("");
  const [precoUnitario, setPrecoUnitario] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [dataVenda, setDataVenda] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [valorAlvo, setValorAlvo] = useState("");

  const opsRef = useRef([]);
  useEffect(() => { opsRef.current = operacoes; }, [operacoes]);

  // ---------- utils ----------
  const formatCurrency = (value) => {
    if (value == null || isNaN(Number(value))) return "-";
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  };

  const calcDiasPosicionado = (op) => {
    if (op?.dias_posicionado != null) return op.dias_posicionado;
    if (!op?.data_compra) return null;
    const hoje = new Date();
    const dc = new Date(op.data_compra);
    const diff = Math.floor((hoje.setHours(0,0,0,0) - dc.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : null;
  };

  // ---------- data loaders ----------
  const fetchCotacoes = async (opsParam) => {
    const ops = opsParam ?? opsRef.current;
    if (!ops || !ops.length) return;

    const tickers = ops.filter(op => !op.data_venda).map(op => `${op.acao_nome}.SA`);
    if (!tickers.length) return;

    try {
      const res = await api("cotacoes-atuais/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });

      const atualizado = ops.map(op => {
        if (!op.data_venda) {
          const cot = res[`${op.acao_nome}.SA`];
          return { ...op, preco_atual: cot?.preco_atual ?? null };
        }
        return op;
      });

      setOperacoes(atualizado);
      // Não mexe no resumo aqui. Patrimônio/posicionadas vêm do backend.
    } catch (err) {
      console.error("Erro ao buscar cotações:", err);
    }
  };

  const fetchResumo = async () => {
    try {
      const res = await api(`clientes/${id}/resumo/`);
      if (res && typeof res === "object" && Object.keys(res).length > 0) {
        setResumo(res);
      } else {
        console.error("Resumo vazio do backend");
        setResumo(null);
      }
    } catch (err) {
      console.error("Erro ao buscar resumo:", err);
      setResumo(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const clienteRes = await api(`clientes/${id}/`);
        setCliente(clienteRes);

        const opsRes = await api(`operacoes/?cliente=${id}`);
        const lista = opsRes.results || opsRes || [];
        setOperacoes(lista);

        // 1) resumo do backend (fonte da verdade)
        await fetchResumo();

        // 2) ações disponíveis
        const acoesRes = await api("acoes/");
        setAcoesDisponiveis(acoesRes);

      } catch (err) {
        console.error("Erro ao buscar dados:", err);
        setResumo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // ---------- ações ----------
  const handleOpen = (op = null) => {
    if (op) {
      setEditing(op);
      setAcao(op.acao);
      setDataCompra(op.data_compra || "");
      setPrecoUnitario(op.preco_unitario ?? "");
      setQuantidade(op.quantidade ?? "");
      setDataVenda(op.data_venda || "");
      setPrecoVenda(op.preco_venda_unitario ?? "");
      setValorAlvo(op.valor_alvo ?? "");
    } else {
      setEditing(null);
      setAcao("");
      setDataCompra("");
      setPrecoUnitario("");
      setQuantidade("");
      setDataVenda("");
      setPrecoVenda("");
      setValorAlvo("");
    }
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  const handleSave = async () => {
    const payload = {
      cliente: Number(id),
      acao: typeof acao === "object" ? acao.id : Number(acao),
      data_compra: dataCompra || null,
      preco_unitario: precoUnitario !== "" ? Number(precoUnitario) : null,
      quantidade: quantidade !== "" ? Number(quantidade) : null,
      data_venda: dataVenda || null,
      preco_venda_unitario: precoVenda !== "" ? Number(precoVenda) : null,
      valor_alvo: valorAlvo !== "" ? Number(valorAlvo) : null,
    };

    try {
      if (editing) {
        await api(`operacoes/${editing.id}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await api("operacoes/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const opsRes = await api(`operacoes/?cliente=${id}`);
      const lista = opsRes.results || opsRes || [];
      setOperacoes(lista);
      handleClose();

      // Atualiza resumo (backend) e, se quiser, cotações
      await fetchResumo();
      // await fetchCotacoes(lista);
    } catch (err) {
      console.error("Erro ao salvar operação:", err);
    }
  };

  const handleDelete = async (opId) => {
    if (confirm("Deseja realmente deletar essa operação?")) {
      try {
        await api(`operacoes/${opId}/`, { method: "DELETE" });
        const nova = operacoes.filter(op => op.id !== opId);
        setOperacoes(nova);

        // Atualiza resumo (backend) e, se quiser, cotações
        await fetchResumo();
        // await fetchCotacoes(nova);
      } catch (err) {
        console.error("Erro ao deletar operação:", err);
      }
    }
  };

  const handleManualRefresh = async (opsArg) => {
    try {
      setUpdatingQuotes(true);
      // 1) Garantir resumo do backend
      await fetchResumo();
      // 2) Atualizar cotações das posicionadas (opcional)
      const base = opsArg ?? opsRef.current;
      await fetchCotacoes(base);
    } finally {
      setUpdatingQuotes(false);
    }
  };

  // ---------- MT5: Recs e Nova Compra ----------
  const abrirNovaCompra = async () => {
    try {
      setOpenRecModal(true);
      const recs = await api(`clientes/${id}/recomendacoes-disponiveis/`);
      setRecsDisponiveis(Array.isArray(recs) ? recs : []);
    } catch (e) {
      console.error("Erro ao carregar recomendações:", e);
      setRecsDisponiveis([]);
    }
  };

  const confirmarRecomendacao = (item) => {
    setRecSelecionada(item);
    setOpenRecModal(false);
    // reset form
    setExecucao("mercado");
    setModoEntrada("quantidade");
    setPrecoLimite("");
    setTpAlvo("");
    setQtdDesejada("");
    setValorDesejado("");
    setLegsSugeridas([]);
    setValidacoesLegs([]);
    setOpenNovaCompraModal(true);
  };

  const validarDistribuicao = async () => {
    if (!recSelecionada) return;
    const body = {
      ticker: recSelecionada.ticker,
      modo: modoEntrada,
      execucao,
      tp: tpAlvo !== "" ? Number(tpAlvo) : null,
    };
    if (execucao === "limite") body.preco = precoLimite !== "" ? Number(precoLimite) : null;
    if (modoEntrada === "quantidade") body.quantidade = qtdDesejada !== "" ? Number(qtdDesejada) : null;
    if (modoEntrada === "valor") body.valor = valorDesejado !== "" ? Number(valorDesejado) : null;

    try {
      const res = await api(`clientes/${id}/mt5/compra/validar/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLegsSugeridas(res?.legs_sugeridas || []);
      setValidacoesLegs(res?.validacoes || []);
    } catch (e) {
      console.error("Erro na validação:", e);
      setLegsSugeridas([]);
      setValidacoesLegs([]);
    }
  };

  const enviarCompra = async () => {
    if (!recSelecionada || !Array.isArray(legsSugeridas) || legsSugeridas.length === 0) return;
    setComprando(true);
    try {
      const body = {
        ticker_base: recSelecionada.ticker,
        execucao,
        tp: Number(tpAlvo),
        legs: legsSugeridas.map((l) => ({ symbol: l.symbol, quantidade: Number(l.quantidade) })),
      };
      if (execucao === "limite") body.preco = Number(precoLimite);
      const res = await api(`clientes/${id}/mt5/compra/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res?.group_id) {
        setGroupId(res.group_id);
        // iniciar polling
        if (compraIntervalRef.current) clearInterval(compraIntervalRef.current);
        compraIntervalRef.current = setInterval(async () => {
          try {
            const st = await api(`clientes/${id}/mt5/compra-status/${res.group_id}/`);
            setCompraStatus(st);
            if (st?.executed_all) {
              clearInterval(compraIntervalRef.current);
              compraIntervalRef.current = null;
              // refresh carteira e resumo
              const opsRes = await api(`operacoes/?cliente=${id}`);
              const lista = opsRes.results || opsRes || [];
              setOperacoes(lista);
              await fetchResumo();
              setComprando(false);
              setOpenNovaCompraModal(false);
            }
          } catch (e) {
            console.error("Erro no polling de compra:", e);
          }
        }, 3000);
      } else {
        setComprando(false);
      }
    } catch (e) {
      console.error("Erro no envio de compra:", e);
      setComprando(false);
    }
  };

  // ---------- filtragem por aba ----------
  const operacoesDoCliente = operacoes.filter(op => Number(op.cliente) === Number(id));
  let operacoesFiltradas = [];
  if (tabIndex === 1) {
    operacoesFiltradas = operacoesDoCliente.filter(op => !op.data_venda); // POSICIONADAS
  } else if (tabIndex === 2) {
    operacoesFiltradas = operacoesDoCliente.filter(op => op.data_venda);  // REALIZADAS
  }

  return (
    <Box sx={{ mt: 12, px: 4 }}>
      <Button onClick={() => navigate("/clientes/")} sx={{ mb: 2 }}>
        ← Voltar para Clientes
      </Button>

      <Typography variant="h4" mb={2}>{cliente?.nome} - Carteira</Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={() => abrirNovaCompra()}>
          Nova Compra (MT5)
        </Button>
        <Button variant="outlined" onClick={() => handleOpen()}>
          Nova Operação (manual)
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => handleManualRefresh()}
          disabled={updatingQuotes}
        >
          {updatingQuotes ? "Atualizando..." : "Atualizar cotações"}
        </Button>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)}>
          <Tab label="Resumo" />
          <Tab label="POSICIONADAS" />
          <Tab label="REALIZADAS" />
        </Tabs>
      </Box>

      {/* Aba Resumo */}
      {tabIndex === 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 3, mt: 2 }}>
          <Box sx={{ p: 3, borderRadius: 2, bgcolor: "#f5f5f5", boxShadow: 1 }}>
            <Typography variant="h6">Patrimônio</Typography>
            <Typography variant="h4" sx={{ fontWeight: "bold" }}>
              R$ {formatCurrency(resumo?.patrimonio)}
            </Typography>
            <Typography sx={{ mt: 1 }}>
              % Patrimônio para RV: {resumo?.percentual_patrimonio ?? "-"}%
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Total em ações posicionadas: <strong>R$ {formatCurrency(resumo?.posicionadas)}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Valor disponível: <strong>R$ {formatCurrency(resumo?.valor_disponivel)}</strong>
            </Typography>
          </Box>

          <Box sx={{ p: 3, borderRadius: 2, bgcolor: "#f5f5f5", boxShadow: 1 }}>
            <Typography variant="h6">Posição Consolidada</Typography>
            <Typography sx={{ mt: 1 }}>
              Rent. realizadas: <strong>R$ {formatCurrency(resumo?.realizadas)}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Rent. pocionadas: <strong>R$ {formatCurrency(resumo?.posicionado)}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Resultado Atual: <strong>R$ {formatCurrency(resumo?.posicionado-(resumo?.realizadas*-1))}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Dias desde a primeira compra: <strong>{resumo?.dias_total ?? "-"}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Rentabilidade média mensal: <strong>{resumo?.rentabilidade_mensal ?? "-"}%</strong>
            </Typography>
          </Box>
        </Box>
      )}

      {/* Aba POSICIONADAS e REALIZADAS */}
      {tabIndex > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ação</TableCell>
              <TableCell>Data Compra</TableCell>
              <TableCell align="center">Preço Unitário</TableCell>
              <TableCell align="center">Quantidade</TableCell>
              <TableCell align="center">Valor Total Compra</TableCell>

              {/* POSICIONADAS */}
              {tabIndex === 1 && <TableCell align="center">Alvo (R$)</TableCell>}
              {tabIndex === 1 && <TableCell align="center">Dias Posicionado</TableCell>}
              {tabIndex === 1 && <TableCell align="center">Preço Atual</TableCell>}
              {tabIndex === 1 && <TableCell align="center">Variação (%)</TableCell>}
              {tabIndex === 1 && <TableCell align="center">To Gain (%)</TableCell>}

              {/* REALIZADAS */}
              {tabIndex === 2 && <TableCell>Data Venda</TableCell>}
              {tabIndex === 2 && <TableCell align="center">Preço Venda</TableCell>}
              {tabIndex === 2 && <TableCell align="center">Valor Total Venda</TableCell>}
              {tabIndex === 2 && <TableCell align="center">% Resultado</TableCell>}
              {tabIndex === 2 && <TableCell align="center">Valor Resultado</TableCell>}

              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {operacoesFiltradas.map((op) => {
              const variacao = (op.preco_atual != null && op.preco_unitario)
                ? (((Number(op.preco_atual) - Number(op.preco_unitario)) / Number(op.preco_unitario)) * 100).toFixed(2)
                : "-";

              const toGain = (op.preco_atual != null && op.valor_alvo != null)
                ? (((Number(op.valor_alvo) - Number(op.preco_atual)) / Number(op.preco_atual)) * 100).toFixed(2)
                : "-";

              const dias = calcDiasPosicionado(op);

              const totalCompra = (op.valor_total_compra != null)
                ? Number(op.valor_total_compra)
                : (op.preco_unitario != null && op.quantidade != null)
                  ? Number(op.preco_unitario) * Number(op.quantidade)
                  : null;

              const totalVenda = (op.valor_total_venda != null)
                ? Number(op.valor_total_venda)
                : (op.preco_venda_unitario != null && op.quantidade != null)
                  ? Number(op.preco_venda_unitario) * Number(op.quantidade)
                  : null;

              const pctResultado = (op.preco_venda_unitario != null && op.preco_unitario)
                ? (((Number(op.preco_venda_unitario) - Number(op.preco_unitario)) / Number(op.preco_unitario)) * 100).toFixed(2)
                : "-";

              const valorResultado = (totalVenda != null && totalCompra != null)
                ? (totalVenda - totalCompra)
                : null;

              return (
                <TableRow key={op.id}>
                  <TableCell>{op.acao_nome}</TableCell>
                  <TableCell>{op.data_compra}</TableCell>
                  <TableCell align="center">{formatCurrency(op.preco_unitario)}</TableCell>
                  <TableCell align="center">{op.quantidade}</TableCell>
                  <TableCell align="center">{formatCurrency(op.valor_total_compra)}</TableCell>

                  {tabIndex === 1 && <TableCell align="center">{formatCurrency(op.valor_alvo)}</TableCell>}
                  {tabIndex === 1 && <TableCell align="center">{dias ?? "-"}</TableCell>}
                  {tabIndex === 1 && <TableCell align="center">{op.preco_atual != null ? formatCurrency(op.preco_atual) : "-"}</TableCell>}
                  {tabIndex === 1 && (
                    <TableCell align="center" sx={{ color: variacao !== "-" && Number(variacao) >= 0 ? "green" : "red" }}>
                      {variacao}%
                    </TableCell>
                  )}
                  {tabIndex === 1 && (
                    <TableCell align="center" sx={{ color: toGain !== "-" && Number(toGain) <= 0 ? "green" : "orange" }}>
                      {toGain}%
                    </TableCell>
                  )}

                  {tabIndex === 2 && <TableCell>{op.data_venda}</TableCell>}
                  {tabIndex === 2 && <TableCell align="center">{formatCurrency(totalVenda)}</TableCell>}
                  {tabIndex === 2 && <TableCell align="center">{formatCurrency(totalVenda)}</TableCell>}
                  {tabIndex === 2 && (
                    <TableCell align="center" sx={{ color: pctResultado !== "-" && Number(pctResultado) >= 0 ? "green" : "red" }}>
                      {pctResultado}%
                    </TableCell>
                  )}
                  {tabIndex === 2 && (
                    <TableCell align="center" sx={{ color: valorResultado == null ? "inherit" : (valorResultado >= 0 ? "green" : "red"), fontWeight: valorResultado == null ? "normal" : 600 }}>
                      {valorResultado == null ? "-" : formatCurrency(valorResultado)}
                    </TableCell>
                  )}

                  <TableCell>
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => handleOpen(op)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Deletar">
                      <IconButton size="small" color="error" onClick={() => handleDelete(op.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Dialog criar/editar operação */}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{editing ? "Editar Operação" : "Nova Operação"}</DialogTitle>
        <DialogContent>
          <TextField select label="Ação" fullWidth value={acao} onChange={(e) => setAcao(e.target.value)} sx={{ mt: 1 }}>
            {acoesDisponiveis.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.ticker}</MenuItem>
            ))}
          </TextField>
          <TextField label="Data Compra" type="date" fullWidth value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ mt: 2 }} />
          <TextField label="Preço Unitário" type="number" fullWidth value={precoUnitario} onChange={(e) => setPrecoUnitario(e.target.value)} sx={{ mt: 2 }} />
          <TextField label="Quantidade" type="number" fullWidth value={quantidade} onChange={(e) => setQuantidade(e.target.value)} sx={{ mt: 2 }} />
          <TextField label="Alvo (R$)" type="number" fullWidth value={valorAlvo} onChange={(e) => setValorAlvo(e.target.value)} sx={{ mt: 2 }} />
          <TextField label="Data Venda" type="date" fullWidth value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ mt: 2 }} />
          <TextField label="Preço Venda" type="number" fullWidth value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave}>{editing ? "Salvar" : "Criar"}</Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Selecionar recomendação */}
      <Dialog open={openRecModal} onClose={() => setOpenRecModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Selecionar recomendação</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ticker</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell align="right">Preço Ref</TableCell>
                <TableCell align="right">Alvo Sug.</TableCell>
                <TableCell align="right">Prob.</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recsDisponiveis.map((r) => (
                <TableRow key={r.acao_id}>
                  <TableCell>{r.ticker}</TableCell>
                  <TableCell>{r.empresa}</TableCell>
                  <TableCell align="right">{formatCurrency(r.preco_compra)}</TableCell>
                  <TableCell align="right">{formatCurrency(r.alvo_sugerido)}</TableCell>
                  <TableCell align="right">{r.probabilidade}%</TableCell>
                  <TableCell>
                    <Button variant="contained" size="small" onClick={() => confirmarRecomendacao(r)}>Selecionar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRecModal(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Nova Compra MT5 */}
      <Dialog open={openNovaCompraModal} onClose={() => setOpenNovaCompraModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nova Compra (MT5) — {recSelecionada?.ticker}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Execução" value={execucao} onChange={(e) => setExecucao(e.target.value)}>
              <MenuItem value="mercado">Mercado</MenuItem>
              <MenuItem value="limite">Limite</MenuItem>
            </TextField>
            {execucao === "limite" && (
              <TextField label="Preço Limite" type="number" value={precoLimite} onChange={(e) => setPrecoLimite(e.target.value)} />
            )}

            <FormLabel>Entrada</FormLabel>
            <RadioGroup row value={modoEntrada} onChange={(e) => setModoEntrada(e.target.value)}>
              <FormControlLabel value="quantidade" control={<Radio />} label="Quantidade" />
              <FormControlLabel value="valor" control={<Radio />} label="Valor (R$)" />
            </RadioGroup>

            {modoEntrada === "quantidade" ? (
              <TextField label="Quantidade desejada" type="number" value={qtdDesejada} onChange={(e) => setQtdDesejada(e.target.value)} />
            ) : (
              <TextField label="Valor desejado (R$)" type="number" value={valorDesejado} onChange={(e) => setValorDesejado(e.target.value)} />
            )}

            <TextField label="Alvo (TP)" type="number" value={tpAlvo} onChange={(e) => setTpAlvo(e.target.value)} />

            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={validarDistribuicao}>Validar</Button>
              <Chip label={`Legs: ${legsSugeridas.length}`} />
            </Stack>

            {legsSugeridas.map((l, idx) => (
              <Stack key={`${l.symbol}-${idx}`} direction="row" spacing={2} alignItems="center">
                <TextField label="Símbolo" value={l.symbol} size="small" InputProps={{ readOnly: true }} />
                <TextField label="Quantidade" type="number" value={l.quantidade} size="small" onChange={(e) => {
                  const v = e.target.value;
                  setLegsSugeridas((old) => old.map((x, i) => i === idx ? { ...x, quantidade: v } : x));
                }} />
              </Stack>
            ))}

            {validacoesLegs?.length > 0 && (
              <Stack spacing={0.5}>
                {validacoesLegs.map((v, i) => (
                  <Typography key={i} variant="caption" color={v.ok ? "green" : "red"}>
                    {v.symbol}: {v.ok ? "OK" : (v.motivo || "inválido")}
                  </Typography>
                ))}
              </Stack>
            )}

            {groupId && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">Acompanhamento (grupo {groupId})</Typography>
                {compraStatus?.summary?.map((s, i) => (
                  <Typography key={i} variant="caption">
                    {s.symbol}: {s.executada ? `executada vol ${s.volume}` : `parcial vol ${s.volume_exec ?? 0}`}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNovaCompraModal(false)} disabled={comprando}>Cancelar</Button>
          <Button variant="contained" onClick={enviarCompra} disabled={comprando || legsSugeridas.length === 0}>Enviar</Button>
        </DialogActions>
      </Dialog>

      <Backdrop sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }} open={loading}>
        <CircularProgress color="inherit" />
        <Typography sx={{ ml: 2 }}>Aguarde, carregando dados da carteira...</Typography>
      </Backdrop>
    </Box>
  );
}
