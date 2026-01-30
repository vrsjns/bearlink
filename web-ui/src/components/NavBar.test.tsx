import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from './NavBar';

// Get the mocked router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
}));

describe('Navbar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when user is not logged in', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

    render(<Navbar />);

    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    expect(screen.queryByText('Create new')).not.toBeInTheDocument();
  });

  it('should render navigation links when user is logged in', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('mock-token');

    render(<Navbar />);

    expect(screen.getByText('Create new')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('should handle logout click', async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('mock-token');
    const user = userEvent.setup();

    render(<Navbar />);
    await user.click(screen.getByText('Logout'));

    expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('should have correct navigation links', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('mock-token');

    render(<Navbar />);

    const createLink = screen.getByText('Create new').closest('a');
    const manageLink = screen.getByText('Manage').closest('a');
    const profileLink = screen.getByText('Profile').closest('a');

    expect(createLink).toHaveAttribute('href', '/');
    expect(manageLink).toHaveAttribute('href', '/manage');
    expect(profileLink).toHaveAttribute('href', '/profile');
  });
});
