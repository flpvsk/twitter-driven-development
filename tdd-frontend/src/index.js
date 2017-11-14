import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import {subscribe} from './apiClient';
import cloneDeep from 'lodash/cloneDeep';
import registerServiceWorker from './registerServiceWorker';

const EMPTY_STATE = {
  hashtag: undefined,
  isLoading: true,
  participantsNumber: 0,
  tasksInProgressNumber: 0,
  tasksDoneNumber: 0,
  poInProgressNumber: 0,
  poThroughput: '',
  devInProgressNumber: 0,
  devThroughput: '',
  qaInProgressNumber: 0,
  qaThroughput: '',
  scoreboardData: []
};

class AppConnected extends Component {
  constructor() {
    super();
    this.state = cloneDeep(EMPTY_STATE);
  }

  componentDidMount() {
    subscribe((msg) => {
      this.setState({
        ...this.state,
        ...msg,
        isLoading: false
      });
    });
  }

  render() {
    return <App {...this.state} />;
  }
}

ReactDOM.render(<AppConnected />, document.getElementById('root'));
registerServiceWorker();
