import Swal from 'sweetalert2'

export const showAlert = (title, icon = 'info') => {
    return Swal.fire({
        title,
        icon,
        confirmButtonColor: '#2563eb', // Blue-600
        background: '#ffffff',
        color: '#0f172a', // Slate-900
        customClass: {
            popup: 'rounded-2xl border border-gray-100 shadow-2xl',
            confirmButton: 'px-6 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors'
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
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#ef4444',
        background: '#ffffff',
        color: '#0f172a',
        confirmButtonText: 'Yes, proceed',
        customClass: {
            popup: 'rounded-2xl border border-gray-100 shadow-2xl',
            confirmButton: 'px-6 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors',
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
        background: '#1e293b', // Slate-800
        color: '#ffffff',
        iconColor: icon === 'success' ? '#3b82f6' : '#ef4444', // Blue or Red
        customClass: {
            popup: 'rounded-xl shadow-xl'
        },
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
