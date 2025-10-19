from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from core.views import ( MyTokenObtainPairView, perfil_usuario, logout_view, ClienteViewSet, 
                        OperacaoCarteiraViewSet, AcaoViewSet, cotacoes_atuais, dashboard_rv, 
                        ImportacaoUploadView, carteira_resumo, patrimonio_disponivel, recomendacoes_api,
                        clientes_mt5_status)


# Router para CRUD de clientes
router = DefaultRouter()
router.register(r'clientes', ClienteViewSet, basename='clientes')
router.register(r'operacoes', OperacaoCarteiraViewSet, basename='operacoes')
router.register(r'acoes', AcaoViewSet, basename='acoes')

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
    path('', include(router.urls)),

    # API para importar arquivos de Patrimônio e Custódia
    path("api/importacao/upload/", ImportacaoUploadView.as_view(), name="importacao_upload"),

    # API para receber dados do resumo
    path("api/clientes/<int:cliente_id>/resumo/", carteira_resumo, name="carteira-resumo"),

    # API para listar o patrimônio de todos os clientes
    path("api/patrimonio-disponivel/", patrimonio_disponivel, name="patrimonio_disponivel"),

    # Status MT5 dos clientes
    path("api/clientes/mt5-status/", clientes_mt5_status, name="clientes_mt5_status"),

    # Para retornar as recomendações diárias
    path("api/recomendacoes/", recomendacoes_api, name="recomendacoes_api"),

]
