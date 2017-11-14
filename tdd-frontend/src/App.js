import React, { Component } from 'react';
import './App.css';

class MainMetricBlock extends Component {
  render() {
    return (
      <div className='MetricBlock'>
        <div className='MainMetricHeader'>
          {this.props.header}
        </div>
        <div className='MainMetricNumber'>
          {this.props.value}
        </div>
        <div className='MainMetricDescription'>
          {this.props.description}
        </div>
      </div>
    );
  }
}


class WorkInProgressMetricBlock extends Component {

  render() {
    let description;

    if (this.props.throughput) {
      description = `${Math.round(this.props.throughput)}s / tweet`;
    }

    return (
      <div className='WorkInProgressMetricBlock'>
        <div className='WorkInProgressMetricHeader'>
          {this.props.header}
        </div>
        <div className='WorkInProgressMetricNumber'>
          {this.props.value}
        </div>
        <div className='WorkInProgressMetricDescription'>
          {description}
        </div>
      </div>
    );
  }
}


class ScoreCard extends Component {
  render() {
    const {
      place,
      tasksDoneNumber,
      meanLeadTime,
      varianceLeadTime,
      usernames
    } = this.props;

    let userLinks = usernames.reduce((acc, user) => {
      acc.push(
        <a key={user} href={`https://twitter.com/${user}`}>@{user}</a>
      );

      if (acc.length !== usernames.length * 2 - 1) {
        acc.push(', ');
      }

      return acc;
    }, []);

    return (
      <div className='ScoreCard'>
        <div className='ScoreCard__Place'>
          #{place}
        </div>
        <div className='ScoreCard__Body'>
          <div className='ScoreCard__Users'>{userLinks}</div>
          <div className='ScoreCard__Metrics'>
            <div className='ScoreCard__Metric'>
              <div className='ScoreCard__MetricName'>
                𝘕<sub className='_supOrSub'>jobs</sub>
              </div>
              <div className='ScoreCard__MetricValue'>
                {tasksDoneNumber}
              </div>
            </div>
            <div className='ScoreCard__Metric'>
              <div className='ScoreCard__MetricName'>
                µ<sub className='_supOrSub'>lead t</sub>
              </div>
              <div className='ScoreCard__MetricValue'>
                {Math.round(meanLeadTime)}s
              </div>
            </div>
            <div className='ScoreCard__Metric'>
              <div className='ScoreCard__MetricName'>
                {
                  '𝜎'
                }<sup className='_supOrSub'>{
                  2
                }</sup><sub className='_supOrSub'>{
                  'lead t'
                }</sub>
              </div>
              <div className='ScoreCard__MetricValue'>
                {Math.round(varianceLeadTime * 100) / 100}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

class App extends Component {
  propTypes: {
    hashtag: React.propTypes.string
  }

  render() {
    const {
      isLoading,
      hashtag,
      participantsNumber,
      tasksInProgressNumber,
      tasksDoneNumber,
      poInProgressNumber,
      poThroughput,
      devInProgressNumber,
      devThroughput,
      qaInProgressNumber,
      qaThroughput,
      scoreboardData
    } = this.props;

    let scoreboardRendered;

    if (!scoreboardData.length) {
      scoreboardRendered = (
        <div className='Info'>
          {`There are no finished jobs yet…`}
        </div>
      );
    }

    if (!!scoreboardData.length) {
      scoreboardRendered = scoreboardData.map((data) => {
        return <ScoreCard key={data.place} {...data} />;
      });
    }

    let hashtagStr;

    if (isLoading) {
      hashtagStr = 'connecting...';
    }

    if (!isLoading && hashtag) {
      hashtagStr = `#${hashtag}`;
    }

    if (!isLoading && !hashtag) {
      hashtagStr = 'no active game rn';
    }

    return (
      <div className='App'>
        <header className='Header'>
          {hashtagStr}
        </header>
        <section className='Section'>
          <MainMetricBlock
            header={'👩‍🎤👨‍🎤'}
            value={participantsNumber}
            description={'participants'} />

          <MainMetricBlock
            header={'⏳'}
            value={tasksInProgressNumber}
            description={'jobs in progress'} />

          <MainMetricBlock
            header={'💰'}
            value={tasksDoneNumber}
            description={'jobs done'} />
        </section>
        <header id='wip' className='Header _topBorder'>
          {'Work in progress'}
        </header>
        <section className='Section'>
          <WorkInProgressMetricBlock
            header={'PO'}
            value={poInProgressNumber}
            throughput={poThroughput} />
          <WorkInProgressMetricBlock
            header={'DEV'}
            value={devInProgressNumber}
            throughput={devThroughput} />
          <WorkInProgressMetricBlock
            header={'QA'}
            value={qaInProgressNumber}
            throughput={qaThroughput} />
        </section>
        <header id='scoreboard' className='Header _topBorder'>
          {'Scoreboard'}
          {scoreboardRendered}
        </header>
      </div>
    );
  }
}




const TEST_STATE = {
  hashtag: '#kanbanbanan',
  participantsNumber: 3,
  tasksInProgressNumber: 10,
  tasksDoneNumber: 3,
  poInProgressNumber: 3,
  poThroughput: 10,
  devInProgressNumber: 5,
  devThroughput: 30,
  qaInProgressNumber: 2,
  qaThroughput: 10,
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

App.defaultProps = TEST_STATE;



export default App;

