import A01CargaDiaria as carga
import A02CalculaMedias as medias
import A03VerificaAlvos as alvo
import A03Recomendcoes_intraday as recomenda


def main():
    print("=== CARGA DE COTAÇÕES ===")
    carga.atualizar_cotacoes(0)
    print("=== CALCULO DE MÉDIAS ===")
    medias.calcular_todas()
    print("=== VERIFICA ALVOS ===")
    alvo.verificar_alvos_recomendacoes()
    print("=== RELATORIO DE RECOMENDACOES ===")
    recomenda.gerar_recomendacoes()


if __name__ == '__main__':
    main()