from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    login_view,
    signup_view,
    my_businesses,
    switch_business,
    UserViewSet,
    AuditLogViewSet,
    garage_settings,
    public_settings,
    available_roles,
    my_pages,
)

router = DefaultRouter()
router.register('users', UserViewSet, basename='users')
router.register('audit', AuditLogViewSet, basename='audit')

urlpatterns = [
    path('login/', login_view),
    path('signup/', signup_view),
    path('businesses/', my_businesses),
    path('switch-business/', switch_business),
    path('refresh/', TokenRefreshView.as_view()),
    path('settings/', garage_settings),
    path('public-settings/', public_settings),
    path('roles/', available_roles),
    path('my-pages/', my_pages),
    path('', include(router.urls)),
]