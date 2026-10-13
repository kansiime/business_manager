from .models import AuditLog
from apps.tenants.base import get_current_tenant


def log(request, action, model_name='', object_id='', description=''):
    try:
        user = request.user if request and request.user.is_authenticated else None
        tenant = get_current_tenant()
        if tenant is None and user:
            tenant = getattr(user, 'tenant', None)

        AuditLog.all_objects.create(
            user=user,
            tenant=tenant,
            action=action,
            model_name=model_name,
            object_id=str(object_id),
            description=description,
        )
    except Exception:
        pass