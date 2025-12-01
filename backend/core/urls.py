from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from core.views import ( MyTokenObtainPairView, perfil_usuario, logout_view, ClienteViewSet, 
                        OperacaoCarteiraViewSet, AcaoViewSet, RecomendacaoIAViewSet, cotacoes_atuais, dashboard_rv, 
                        ImportacaoUploadView, carteira_resumo, patrimonio_disponivel, recomendacoes_api,
                        clientes_mt5_status,
                        recomendacoes_disponiveis,
                        mt5_cotacao_atual,
                        mt5_compra_validar,
                        mt5_compra,
                        mt5_compra_status,
                        mt5_venda,
                        mt5_venda_status,
                        indices_economicos,
                        )


# Router para CRUD de clientes
router = DefaultRouter()
router.register(r'clientes', ClienteViewSet, basename='clientes')
router.register(r'operacoes', OperacaoCarteiraViewSet, basename='operacoes')
router.register(r'acoes', AcaoViewSet, basename='acoes')
router.register(r'recomendacoes-ia', RecomendacaoIAViewSet, basename='recomendacoes-ia')

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT
    path('api/token/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Endpoints protegidos pelo DRF
    path('api/', include(router.urls)),

    # Perfil e logout
    path('api/perfil/', perfil_usuario, name='perfil_usuario'),
    path('api/logout/', logout_view, name='logout'),

    # API com o yfinance
    path("api/cotacoes-atuais/", cotacoes_atuais, name="cotacoes_atuais"),
    path("api/dashboard-rv/", dashboard_rv, name="dashboard_rv"),
    path("api/indices/", indices_economicos, name="indices_economicos"),
    path('', include(router.urls)),

    # API para importar arquivos de Patrimônio e Custódia
    path("api/importacao/upload/", ImportacaoUploadView.as_view(), name="importacao_upload"),

    # API para receber dados do resumo
    path("api/clientes/<int:cliente_id>/resumo/", carteira_resumo, name="carteira-resumo"),

    # API para listar o patrimônio de todos os clientes
    path("api/patrimonio-disponivel/", patrimonio_disponivel, name="patrimonio_disponivel"),

    # Status MT5 dos clientes
    path("api/clientes-status/", clientes_mt5_status, name="clientes_mt5_status"),

    # Para retornar as recomendações diárias
    path("api/recomendacoes/", recomendacoes_api, name="recomendacoes_api"),

    # Recomendações disponíveis para um cliente (sem posição aberta)
    path("api/clientes/<int:cliente_id>/recomendacoes-disponiveis/", recomendacoes_disponiveis, name="recomendacoes_disponiveis"),
    path("api/clientes/<int:cliente_id>/mt5/cotacao/<str:ticker>/", mt5_cotacao_atual, name="mt5_cotacao_atual"),

    # Fluxo de compra MT5
    path("api/clientes/<int:cliente_id>/mt5/compra/validar/", mt5_compra_validar, name="mt5_compra_validar"),
    path("api/clientes/<int:cliente_id>/mt5/compra/", mt5_compra, name="mt5_compra"),
    path("api/clientes/<int:cliente_id>/mt5/compra-status/<uuid:group_id>/", mt5_compra_status, name="mt5_compra_status"),

    # Fluxo de venda MT5 (encerra 100% da operação)
    path("api/clientes/<int:cliente_id>/mt5/venda/<int:operacao_id>/", mt5_venda, name="mt5_venda"),
    path("api/clientes/<int:cliente_id>/mt5/venda-status/<uuid:group_id>/", mt5_venda_status, name="mt5_venda_status"),

]
