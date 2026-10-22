import React from "react";

// Last line of defence: if any component throws while rendering,
// show a friendly screen instead of a blank white page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="app">
        <div className="screen">
          <div className="emptyState" style={{ paddingTop: 80 }}>
            <p className="cardTitle">Something went wrong</p>
            <p className="small">The page hit an unexpected problem. Your data is safe.</p>
            <button className="primaryBtn" style={{ maxWidth: 220 }} onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
