import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders TruckTalk login page', () => {
  render(<App />);
  const titleElement = screen.getByText(/TruckTalk/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders login subtitle', () => {
  render(<App />);
  const subtitleElement = screen.getByText(/트럭 운전자를 위한 음성 통화 서비스/i);
  expect(subtitleElement).toBeInTheDocument();
});

test('renders kakao login button', () => {
  render(<App />);
  const loginButton = screen.getByText(/카카오 계정으로 로그인/i);
  expect(loginButton).toBeInTheDocument();
});
