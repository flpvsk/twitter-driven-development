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
  poLeadTime: undefined,
  devInProgressNumber: 0,
  devLeadTime: undefined,
  qaInProgressNumber: 0,
  qaLeadTime: undefined,
  systemLeadTime: {
    min: undefined,
    max: undefined,
    avg: undefined
  },
  scoreboardData: []
};

/*
const TEST_STATE = {
  hashtag: 'kanbanbanan',
  isLoading: false,
  participantsNumber: 3,
  tasksInProgressNumber: 10,
  tasksDoneNumber: 3,
  poInProgressNumber: 3,
  poLeadTime: 10,
  devInProgressNumber: 5,
  devLeadTime: 30,
  qaInProgressNumber: 2,
  qaLeadTime: 10,
  systemLeadTime: {
    min: 10,
    max: 105,
    avg: 400
  },
  scoreboardData: [
    {
      place: 1,
      usernames: [
        'mngr999',
        'flpvsk',
        'fat',
        'dog_rates'
      ],
      tasksDoneNumber: 2,
      meanLeadTime: 31,
      varianceLeadTime: 3.1753
    },
    {
      place: 2,
      usernames: [
        'mngr999',
        'flpvsk',
        'fat',
        'dog_rates'
      ],
      tasksDoneNumber: 1,
      meanLeadTime: 85.32,
      varianceLeadTime: 0
    },
    {
      place: 3,
      usernames: [
        'mngr999',
        'flpvsk',
        'fat',
        'dog_rates'
      ],
      tasksDoneNumber: 1,
      meanLeadTime: 103.5,
      varianceLeadTime: 0
    }
  ]
};
*/

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
