import Swal from 'sweetalert2'

const primaryColor = '#2d6a4f'
const dangerColor = '#ef4444'

export const showAlert = (title, icon = 'info') => {
    return Swal.fire({
        title,
        icon,
        confirmButtonColor: primaryColor,
        background: '#fff',
        color: '#1a1a1a',
        customClass: {
            popup: 'rounded-2xl',
            confirmButton: 'px-6 py-2.5 rounded-xl font-bold'
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
        confirmButtonColor: primaryColor,
        cancelButtonColor: dangerColor,
        confirmButtonText: 'Yes, proceed',
        customClass: {
            popup: 'rounded-2xl',
            confirmButton: 'px-6 py-2.5 rounded-xl font-bold',
            cancelButton: 'px-6 py-2.5 rounded-xl font-bold'
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
