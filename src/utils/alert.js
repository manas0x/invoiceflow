import Swal from 'sweetalert2'

const primaryColor = '#2d6a4f'
const dangerColor = '#ef4444'

export const showAlert = (title, icon = 'info') => {
    return Swal.fire({
        title,
        icon,
        confirmButtonColor: 'var(--primary)',
        background: 'var(--surface)',
        color: 'var(--text-main)',
        customClass: {
            popup: 'rounded-2xl border border-border shadow-2xl',
            confirmButton: 'px-6 py-2.5 rounded-xl font-bold btn-primary text-white'
        }
    })
}

export const showSuccess = (title) => showAlert(title, 'success')
export const showError = (title) => showAlert(title, 'error')

export const showConfirm = async (title, text = "You won't be able to revert this!") => {
    const result = await Swal.fire({
        title,
        text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--primary)',
        cancelButtonColor: 'var(--danger, #ef4444)',
        background: 'var(--surface)',
        color: 'var(--text-main)',
        confirmButtonText: 'Yes, proceed',
        customClass: {
            popup: 'rounded-2xl border border-border shadow-2xl',
            confirmButton: 'px-6 py-2.5 rounded-xl font-bold btn-primary text-white',
            cancelButton: 'px-6 py-2.5 rounded-xl font-bold hover:bg-red-600 transition-colors'
        }
    })
    return result.isConfirmed
}

export const showToast = (title, icon = 'success') => {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    })

    Toast.fire({
        icon,
        title
    })
}
