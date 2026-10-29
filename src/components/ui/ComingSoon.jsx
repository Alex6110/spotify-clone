import React from 'react';
import { Hourglass } from 'lucide-react';

const ComingSoon = ({ title, text }) => (
  <div className="coming-soon">
    <Hourglass size={36} />
    <h2>{title}</h2>
    <p>{text || 'Questa sezione arriverà nella prossima fase.'}</p>
  </div>
);

export default ComingSoon;
